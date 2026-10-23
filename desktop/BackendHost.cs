using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Threading;

// MorningDesk backend host.
// Runs as a GUI-subsystem process (no console window), keeps exactly one
// MorningDeskBackend.exe alive and hidden, and writes everything to a log.
internal static class Program
{
    private const int Port = 43761;
    private static readonly object LogLock = new object();
    private static string logPath;
    private static Process child;

    [STAThread]
    private static void Main()
    {
        string root = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MorningDesk");
        logPath = Path.Combine(root, "logs", "backend.log");
        try { Directory.CreateDirectory(Path.GetDirectoryName(logPath)); }
        catch { }

        bool createdNew;
        // Local\ (session scoped) is enough for a per-user desktop process and
        // does not require the SeCreateGlobalPrivilege.
        using (Mutex mutex = new Mutex(true, @"Local\MorningDesk.BackendHost", out createdNew))
        {
            if (!createdNew)
            {
                Log("Another MorningDesk backend host is already running; exiting.");
                return;
            }

            try { Run(); }
            catch (Exception error) { Log("FATAL " + error); }
        }
    }

    private static void Run()
    {
        string appDir = AppDomain.CurrentDomain.BaseDirectory;
        string backendPath = Path.Combine(appDir, "MorningDeskBackend.exe");
        Log("MorningDesk backend host starting. Backend: " + backendPath);

        if (!File.Exists(backendPath))
        {
            Log("Backend executable not found; host will exit.");
            return;
        }

        Process current = null;
        if (IsPortOpen())
        {
            current = FindRunningBackend();
            if (current == null)
            {
                Log("Port " + Port + " is served by an unknown process; host will exit.");
                return;
            }
            child = current;
            Log("Adopting already running backend, pid " + current.Id + " (" + Describe(current) + ").");
        }

        AppDomain.CurrentDomain.ProcessExit += delegate { StopChild(); };

        int backoffSeconds = 2;
        DateTime startedAt = DateTime.UtcNow;
        while (true)
        {
            if (current == null)
            {
                // Wait while somebody else owns the port (for example an older
                // application-wallpaper instance that started its own backend).
                while (IsPortOpen())
                {
                    Thread.Sleep(2000);
                }

                current = StartBackend(backendPath, appDir);
                if (current == null)
                {
                    Thread.Sleep(backoffSeconds * 1000);
                    backoffSeconds = Math.Min(backoffSeconds * 2, 60);
                    continue;
                }
                child = current;
                startedAt = DateTime.UtcNow;
            }

            current.WaitForExit();
            double uptime = (DateTime.UtcNow - startedAt).TotalSeconds;
            int exitCode = -1;
            try { exitCode = current.ExitCode; }
            catch { }
            Log("Backend exited with code " + exitCode + " after " + Math.Round(uptime) + "s.");

            try { current.Dispose(); }
            catch { }
            current = null;
            child = null;

            if (uptime > 60) backoffSeconds = 2;
            Thread.Sleep(backoffSeconds * 1000);
            backoffSeconds = Math.Min(backoffSeconds * 2, 60);
        }
    }

    private static Process FindRunningBackend()
    {
        Process[] candidates = Process.GetProcessesByName("MorningDeskBackend");
        if (candidates.Length == 0) return null;
        for (int index = 1; index < candidates.Length; index++)
        {
            try { candidates[index].Dispose(); }
            catch { }
        }
        return candidates[0];
    }

    private static string Describe(Process process)
    {
        try { return process.MainModule.FileName; }
        catch { return "path unavailable"; }
    }

    private static Process StartBackend(string backendPath, string appDir)
    {
        try
        {
            ProcessStartInfo info = new ProcessStartInfo
            {
                FileName = backendPath,
                WorkingDirectory = appDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };
            // The SEA entry point tries to re-launch itself elevated unless this
            // flag is set. The scheduled task already runs us with the highest
            // privileges, so the extra UAC prompt must be suppressed.
            info.EnvironmentVariables["MORNING_DESK_SKIP_ELEVATION"] = "1";
            info.EnvironmentVariables["HOST"] = "127.0.0.1";
            info.EnvironmentVariables["PORT"] = Port.ToString();

            Process process = new Process();
            process.StartInfo = info;
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data != null) Log("out  " + e.Data);
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data != null) Log("err  " + e.Data);
            };
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            Log("Backend started, pid " + process.Id + ".");
            return process;
        }
        catch (Exception error)
        {
            Log("Failed to start backend: " + error);
            return null;
        }
    }

    private static void StopChild()
    {
        try
        {
            if (child != null && !child.HasExited) child.Kill();
        }
        catch { }
    }

    private static bool IsPortOpen()
    {
        try
        {
            using (TcpClient client = new TcpClient())
            {
                IAsyncResult result = client.BeginConnect("127.0.0.1", Port, null, null);
                if (!result.AsyncWaitHandle.WaitOne(700)) return false;
                client.EndConnect(result);
                return true;
            }
        }
        catch
        {
            return false;
        }
    }

    private static void Log(string message)
    {
        try
        {
            lock (LogLock)
            {
                FileInfo info = new FileInfo(logPath);
                if (info.Exists && info.Length > 5 * 1024 * 1024)
                {
                    string previous = logPath + ".1";
                    if (File.Exists(previous)) File.Delete(previous);
                    File.Move(logPath, previous);
                }
                File.AppendAllText(
                    logPath,
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + "  " + message + Environment.NewLine,
                    Encoding.UTF8);
            }
        }
        catch { }
    }
}
