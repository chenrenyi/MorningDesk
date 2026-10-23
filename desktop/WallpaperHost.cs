using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;

internal sealed class WallpaperForm : Form
{
    private const int Port = 43761;
    private const int WmDisplayChange = 0x007E;
    private const int WmPowerBroadcast = 0x0218;
    private const int PbtApmResumeSuspend = 0x0007;
    private const int PbtApmResumeAutomatic = 0x0012;
    private const int PbtPowerSettingChange = 0x8013;
    private readonly System.Windows.Forms.Timer resizeTimer = new System.Windows.Forms.Timer();
    private readonly System.Windows.Forms.Timer recoveryTimer = new System.Windows.Forms.Timer();
    private readonly Mutex webViewInitializationMutex;
    private CoreWebView2Controller wallpaperController;
    private Process backend;
    private Task backendStartTask;
    private bool initializationStarted;
    private bool webViewOperationInProgress;
    private string pendingRecoveryReason;
    private readonly IntPtr parentWindow;

    public WallpaperForm(IntPtr parentWindow)
    {
        this.parentWindow = parentWindow;
        // Use process-specific mutex to avoid conflicts between old and new instances
        string mutexName = @"Local\MorningDeskDashboard.WebView2Init." + Process.GetCurrentProcess().Id;
        webViewInitializationMutex = new Mutex(false, mutexName);
        Text = "Morning Desk Wallpaper";
        BackColor = Color.Black;
        ClientSize = new Size(1280, 720);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.None;
        WindowState = FormWindowState.Maximized;
        Load += async delegate { await StartDashboardOnceAsync(); };
        FormClosed += delegate
        {
            SystemEvents.DisplaySettingsChanged -= OnDisplaySettingsChanged;
            recoveryTimer.Stop();
            recoveryTimer.Dispose();
            resizeTimer.Stop();
            resizeTimer.Dispose();
            if (wallpaperController != null) wallpaperController.Close();
            StopOwnedBackend();
        };
        resizeTimer.Interval = 1000;
        resizeTimer.Tick += delegate { ResizeController(); };
        resizeTimer.Start();
        recoveryTimer.Interval = 2000;
        recoveryTimer.Tick += async delegate
        {
            recoveryTimer.Stop();
            await RecoverWebViewAsync(pendingRecoveryReason ?? "timer");
        };
        SystemEvents.DisplaySettingsChanged += OnDisplaySettingsChanged;
    }

    private async Task StartDashboardOnceAsync()
    {
        if (initializationStarted) return;
        initializationStarted = true;
        try
        {
            await StartDashboardAsync();
        }
        catch (Exception error)
        {
            Log(error.ToString());
            Close();
        }
    }

    private async Task StartDashboardAsync()
    {
        Log("Starting dashboard initialization.");
        Log("Wallpaper Engine parent argument: " + parentWindow);
        Log("Starting embedded backend.");
        ProcessStartInfo startInfo = new ProcessStartInfo
        {
            FileName = Path.Combine(Environment.CurrentDirectory, "MorningDeskBackend.exe"),
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
            WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory
        };
        startInfo.EnvironmentVariables["MORNING_DESK_SKIP_ELEVATION"] = "1";
        backendStartTask = Task.Run(delegate
        {
            try
            {
                backend = Process.Start(startInfo);
                Log("Embedded backend process started.");
            }
            catch (Exception error)
            {
                Log("Failed to start embedded backend: " + error);
            }
        });

        Log("Initializing WebView2.");
        Log("Waiting for WebView2 initialization lock.");
        bool acquiredInitializationLock;
        try
        {
            acquiredInitializationLock = webViewInitializationMutex.WaitOne(15000);
        }
        catch (AbandonedMutexException)
        {
            Log("Recovered abandoned WebView2 initialization lock.");
            acquiredInitializationLock = true;
        }
        if (!acquiredInitializationLock)
            throw new TimeoutException("Timed out while waiting for the WebView2 initialization lock.");
        Log("Acquired WebView2 initialization lock.");
        try
        {
            await InitializeWebViewAsync();
        }
        finally
        {
            webViewInitializationMutex.ReleaseMutex();
            Log("Released WebView2 initialization lock.");
        }
    }

    private async Task InitializeWebViewAsync()
    {
        if (webViewOperationInProgress)
        {
            Log("WebView operation already in progress; skipping initialization request.");
            return;
        }
        webViewOperationInProgress = true;
        try
        {
        string userDataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MorningDeskWallpaper",
            "WebView2",
            Process.GetCurrentProcess().Id.ToString()
        );
        Log("WebView2 user data directory: " + userDataDir);
        Task<CoreWebView2Environment> environmentTask = CoreWebView2Environment.CreateAsync(null, userDataDir);
        if (await Task.WhenAny(environmentTask, Task.Delay(10000)) != environmentTask)
            throw new TimeoutException("Timed out while creating the WebView2 environment.");
        CoreWebView2Environment environment = await environmentTask;
        Log("Created WebView2 environment.");
        IntPtr controllerWindow = parentWindow != IntPtr.Zero ? parentWindow : Handle;
        Log("Creating WebView2 controller for host window: " + controllerWindow);
        Task<CoreWebView2Controller> controllerTask = environment.CreateCoreWebView2ControllerAsync(controllerWindow);
        if (await Task.WhenAny(controllerTask, Task.Delay(10000)) != controllerTask)
            throw new TimeoutException("Timed out while initializing the WebView2 controller.");
        wallpaperController = await controllerTask;
        ResizeController();
        CoreWebView2 coreWebView = wallpaperController.CoreWebView2;
        Log("Initialized WebView2 controller.");
        coreWebView.Settings.AreDefaultContextMenusEnabled = false;
        coreWebView.Settings.AreDevToolsEnabled = false;
        coreWebView.ProcessFailed += delegate(object sender, CoreWebView2ProcessFailedEventArgs args)
        {
            Log("WebView2 process failed. Kind=" + args.ProcessFailedKind);
            ScheduleRecovery("WebView2 process failed: " + args.ProcessFailedKind, true);
        };
        // Ensure WebView2 remains visible and responsive in Wallpaper Engine
        wallpaperController.IsVisible = true;
        wallpaperController.ShouldDetectMonitorScaleChanges = true;
        coreWebView.NavigationCompleted += delegate(object sender, CoreWebView2NavigationCompletedEventArgs args)
        {
            Log("Navigation completed. Success=" + args.IsSuccess + " Status=" + args.WebErrorStatus);
        };
        Log("Navigating to dashboard.");
        coreWebView.Navigate("http://127.0.0.1:" + Port + "/lifestyle.html");
        }
        finally
        {
            webViewOperationInProgress = false;
        }
    }

    private void ResizeController()
    {
        if (wallpaperController == null) return;
        IntPtr controllerWindow = parentWindow != IntPtr.Zero ? parentWindow : Handle;
        NativeRect rect;
        if (!GetClientRect(controllerWindow, out rect)) return;
        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;
        if (width <= 0 || height <= 0) return;
        wallpaperController.Bounds = new Rectangle(0, 0, width, height);
        try { wallpaperController.NotifyParentWindowPositionChanged(); } catch { }
    }

    private void OnDisplaySettingsChanged(object sender, EventArgs args)
    {
        ScheduleRecovery("display settings changed", false);
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == WmDisplayChange)
        {
            ScheduleRecovery("WM_DISPLAYCHANGE", false);
        }
        else if (message.Msg == WmPowerBroadcast)
        {
            int powerEvent = message.WParam.ToInt32();
            if (powerEvent == PbtApmResumeSuspend || powerEvent == PbtApmResumeAutomatic || powerEvent == PbtPowerSettingChange)
            {
                ScheduleRecovery("WM_POWERBROADCAST " + powerEvent, false);
            }
        }
        base.WndProc(ref message);
    }

    private void ScheduleRecovery(string reason, bool recreate)
    {
        if (IsDisposed) return;
        if (InvokeRequired)
        {
            try { BeginInvoke((Action)(() => ScheduleRecovery(reason, recreate))); } catch { }
            return;
        }
        pendingRecoveryReason = recreate ? reason + " (recreate)" : reason;
        Log("Scheduling WebView recovery. Reason=" + pendingRecoveryReason);
        recoveryTimer.Stop();
        recoveryTimer.Start();
    }

    private async Task RecoverWebViewAsync(string reason)
    {
        if (IsDisposed || webViewOperationInProgress) return;
        Log("Recovering WebView. Reason=" + reason);
        bool shouldRecreate = false;
        try
        {
            if (reason.IndexOf("(recreate)", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                await RecreateWebViewAsync(reason);
                return;
            }

            if (wallpaperController == null)
            {
                await InitializeWebViewAsync();
                return;
            }

            wallpaperController.IsVisible = false;
            ResizeController();
            wallpaperController.IsVisible = true;
            ResizeController();
            try
            {
                await wallpaperController.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new Event('resize')); document.body && document.body.getBoundingClientRect();");
            }
            catch (Exception scriptError)
            {
                Log("Recovery script failed: " + scriptError.Message);
            }
            wallpaperController.CoreWebView2.Reload();
            Log("Recovery reload requested.");
        }
        catch (Exception error)
        {
            Log("Soft recovery failed: " + error);
            shouldRecreate = true;
        }
        if (shouldRecreate) await RecreateWebViewAsync("soft recovery failed");
    }

    private async Task RecreateWebViewAsync(string reason)
    {
        if (webViewOperationInProgress) return;
        Log("Recreating WebView. Reason=" + reason);
        try
        {
            if (wallpaperController != null)
            {
                wallpaperController.Close();
                wallpaperController = null;
            }
        }
        catch (Exception closeError)
        {
            Log("Failed to close old WebView controller: " + closeError.Message);
        }
        await InitializeWebViewAsync();
    }

    private void StopOwnedBackend()
    {
        if (backend == null || backend.HasExited) return;
        try { backend.Kill(); } catch { }
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetClientRect(IntPtr window, out NativeRect rect);

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private static void Log(string message)
    {
        WallpaperHost.Log(message);
    }
}

internal static class WallpaperHost
{
    private static string appDir;
    private static string logPath;

    [STAThread]
    private static void Main()
    {
        try
        {
            IntPtr parentWindow = GetParentWindow(args: Environment.GetCommandLineArgs());
            // Note: No mutex needed for frontend - backend handles port conflicts
            // Multiple WebView2 instances can coexist and share the same backend
            appDir = ExtractPayload();
            AppDomain.CurrentDomain.AssemblyResolve += ResolveEmbeddedAssembly;
            Environment.CurrentDirectory = appDir;
            Log("Starting wallpaper host.");
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new WallpaperForm(parentWindow));
            Log("Wallpaper host stopped.");
        }
        catch (Exception error)
        {
            Log(error.ToString());
        }
    }

    private static string ExtractPayload()
    {
        string version = Assembly.GetExecutingAssembly().GetName().Version.ToString();
        string targetDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MorningDeskWallpaper",
            version
        );
        logPath = Path.Combine(targetDir, "wallpaper.log");
        string readyMarker = Path.Combine(targetDir, "payload.ready");
        Directory.CreateDirectory(targetDir);
        if (File.Exists(readyMarker))
        {
            Log("Reusing extracted payload.");
            return targetDir;
        }

        using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("MorningDeskWallpaperPayload"))
        using (ZipArchive archive = new ZipArchive(resource, ZipArchiveMode.Read))
        {
            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                string destination = Path.Combine(targetDir, entry.FullName);
                if (String.IsNullOrEmpty(entry.Name))
                {
                    Directory.CreateDirectory(destination);
                    continue;
                }
                Directory.CreateDirectory(Path.GetDirectoryName(destination));
                entry.ExtractToFile(destination, true);
            }
        }
        File.WriteAllText(readyMarker, DateTime.Now.ToString("O"));
        Log("Extracted payload.");
        return targetDir;
    }

    private static Assembly ResolveEmbeddedAssembly(object sender, ResolveEventArgs args)
    {
        string name = new AssemblyName(args.Name).Name + ".dll";
        string path = Path.Combine(appDir, name);
        return File.Exists(path) ? Assembly.Load(File.ReadAllBytes(path)) : null;
    }

    private static IntPtr GetParentWindow(string[] args)
    {
        for (int index = 0; index < args.Length - 1; index++)
        {
            if (String.Equals(args[index], "-parentHWND", StringComparison.OrdinalIgnoreCase))
            {
                long value;
                if (Int64.TryParse(args[index + 1], out value)) return new IntPtr(value);
            }
        }
        return IntPtr.Zero;
    }

    internal static void Log(string message)
    {
        try
        {
            if (String.IsNullOrEmpty(logPath))
            {
                string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MorningDeskWallpaper");
                Directory.CreateDirectory(root);
                logPath = Path.Combine(root, "wallpaper.log");
            }
            File.AppendAllText(logPath, DateTime.Now.ToString("O") + " " + message + Environment.NewLine);
        }
        catch { }
    }
}
