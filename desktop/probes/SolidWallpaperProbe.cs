using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

internal sealed class SolidProbeForm : Form
{
    private readonly Timer heartbeat = new Timer();

    public SolidProbeForm()
    {
        Text = "Morning Desk Solid Probe";
        BackColor = Color.FromArgb(20, 92, 118);
        ClientSize = new Size(1280, 720);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.None;
        WindowState = FormWindowState.Maximized;
        HandleCreated += delegate { WriteWindowState("HandleCreated"); };
        Load += delegate { WriteWindowState("Load"); };
        Shown += delegate { WriteWindowState("Shown"); };
        FormClosed += delegate { ProbeLog.Write("FormClosed"); };
        heartbeat.Interval = 5000;
        heartbeat.Tick += delegate { WriteWindowState("Heartbeat"); };
        heartbeat.Start();
    }

    private void WriteWindowState(string eventName)
    {
        IntPtr handle = Handle;
        ProbeLog.Write(
            eventName +
            " Handle=" + handle +
            " Parent=" + GetParent(handle) +
            " Size=" + Width + "x" + Height +
            " Visible=" + Visible
        );
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetParent(IntPtr window);
}

internal static class ProbeLog
{
    private static readonly string LogPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MorningDeskWallpaper",
        "probes",
        "solid.log"
    );

    public static void Write(string message)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(LogPath));
            File.AppendAllText(LogPath, DateTime.Now.ToString("O") + " " + message + Environment.NewLine);
        }
        catch { }
    }
}

internal static class SolidWallpaperProbe
{
    [STAThread]
    private static void Main()
    {
        ProbeLog.Write("Process started. Args=" + String.Join(" ", Environment.GetCommandLineArgs()));
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new SolidProbeForm());
        ProbeLog.Write("Process stopped.");
    }
}
