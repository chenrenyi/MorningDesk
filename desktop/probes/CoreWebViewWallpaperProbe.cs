using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

internal sealed class CoreWebViewProbeForm : Form
{
    private readonly IntPtr wallpaperWindow;
    private readonly Timer heartbeat = new Timer();
    private CoreWebView2Controller controller;

    public CoreWebViewProbeForm(IntPtr wallpaperWindow)
    {
        this.wallpaperWindow = wallpaperWindow;
        Text = "Morning Desk Core WebView Probe";
        BackColor = Color.Black;
        ClientSize = new Size(1280, 720);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.None;
        WindowState = FormWindowState.Maximized;
        Load += async delegate
        {
            WriteWindowState("Load");
            await InitializeWebViewAsync();
        };
        Shown += delegate { WriteWindowState("Shown"); };
        heartbeat.Interval = 5000;
        heartbeat.Tick += delegate
        {
            WriteWindowState("Heartbeat");
            ResizeController();
        };
        heartbeat.Start();
    }

    private async Task InitializeWebViewAsync()
    {
        try
        {
            ProbeLog.Write("Creating Core WebView2 controller. WallpaperWindow=" + wallpaperWindow);
            string userDataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MorningDeskWallpaper",
                "probes",
                "corewebview",
                Process.GetCurrentProcess().Id.ToString()
            );
            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, userDataDir);
            ProbeLog.Write("Created WebView2 environment.");
            controller = await environment.CreateCoreWebView2ControllerAsync(wallpaperWindow);
            ProbeLog.Write("Initialized Core WebView2 controller.");
            ResizeController();
            controller.CoreWebView2.NavigationCompleted += delegate(object sender, CoreWebView2NavigationCompletedEventArgs args)
            {
                ProbeLog.Write("Navigation completed. Success=" + args.IsSuccess + " Status=" + args.WebErrorStatus);
            };
            controller.CoreWebView2.NavigateToString(
                "<!doctype html><html><body style='margin:0;background:#24143d;color:#f2eaff;" +
                "font-family:Segoe UI,Arial;height:100vh;display:grid;place-items:center'>" +
                "<main style='text-align:center'><h1 style='font-size:72px;margin:0'>Core WebView2 probe</h1>" +
                "<p style='font-size:30px'>Rendering directly inside the Wallpaper Engine host HWND.</p></main>" +
                "</body></html>"
            );
            ProbeLog.Write("Navigating to static HTML.");
        }
        catch (Exception error)
        {
            ProbeLog.Write(error.ToString());
        }
    }

    private void ResizeController()
    {
        if (controller == null) return;
        NativeRect rect;
        if (!GetClientRect(wallpaperWindow, out rect)) return;
        controller.Bounds = new Rectangle(0, 0, rect.Right - rect.Left, rect.Bottom - rect.Top);
        ProbeLog.Write("Controller size=" + controller.Bounds.Width + "x" + controller.Bounds.Height);
    }

    private void WriteWindowState(string eventName)
    {
        ProbeLog.Write(
            eventName +
            " Handle=" + Handle +
            " Parent=" + GetParent(Handle) +
            " WallpaperWindow=" + wallpaperWindow +
            " Size=" + Width + "x" + Height +
            " Visible=" + Visible
        );
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetParent(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool GetClientRect(IntPtr window, out NativeRect rect);

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }
}

internal static class ProbeLog
{
    private static readonly string LogPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MorningDeskWallpaper",
        "probes",
        "corewebview.log"
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

internal static class CoreWebViewWallpaperProbe
{
    [STAThread]
    private static void Main()
    {
        string[] args = Environment.GetCommandLineArgs();
        IntPtr wallpaperWindow = GetWallpaperWindow(args);
        ProbeLog.Write("Process started. Args=" + String.Join(" ", args));
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new CoreWebViewProbeForm(wallpaperWindow));
        ProbeLog.Write("Process stopped.");
    }

    private static IntPtr GetWallpaperWindow(string[] args)
    {
        for (int index = 0; index < args.Length - 1; index++)
        {
            if (!String.Equals(args[index], "-parentHWND", StringComparison.OrdinalIgnoreCase)) continue;
            long value;
            if (Int64.TryParse(args[index + 1], out value)) return new IntPtr(value);
        }
        return IntPtr.Zero;
    }
}
