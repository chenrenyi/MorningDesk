using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;

internal static class Bootstrap
{
    [STAThread]
    private static void Main()
    {
        string version = Assembly.GetExecutingAssembly().GetName().Version.ToString();
        string targetDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MorningDeskDashboard",
            version
        );
        string hostPath = Path.Combine(targetDir, "MorningDeskHost.exe");
        string readyMarker = Path.Combine(targetDir, "payload.ready");

        Directory.CreateDirectory(targetDir);
        if (!File.Exists(readyMarker))
        {
            using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("MorningDeskPayload"))
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
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = hostPath,
            UseShellExecute = false,
            WorkingDirectory = targetDir
        });
    }
}
