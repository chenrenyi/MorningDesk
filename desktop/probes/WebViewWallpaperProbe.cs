using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal sealed class WebViewProbeForm : Form
{
    private readonly WebView2 webView = new WebView2();
    private readonly Timer heartbeat = new Timer();
    private readonly Timer initializationTimer = new Timer();
    private bool initializationStarted;
    private int initializationAttempts;

    public WebViewProbeForm()
    {
        Text = "Morning Desk WebView Probe";
        BackColor = Color.Black;
        ClientSize = new Size(1280, 720);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.None;
        WindowState = FormWindowState.Maximized;
        webView.Dock = DockStyle.Fill;
        Controls.Add(webView);
        HandleCreated += delegate { WriteWindowState("HandleCreated"); };
        Load += delegate
        {
            WriteWindowState("Load");
            initializationTimer.Interval = 250;
            initializationTimer.Tick += async delegate
            {
                initializationAttempts++;
                if (GetParent(Handle) == IntPtr.Zero && initializationAttempts < 8) return;
                initializationTimer.Stop();
                ProbeLog.Write("Starting WebView2 after host attachment check. Parent=" + GetParent(Handle));
                await InitializeWebViewAsync();
            };
            initializationTimer.Start();
        };
        Shown += delegate { WriteWindowState("Shown"); };
        heartbeat.Interval = 5000;
        heartbeat.Tick += delegate { WriteWindowState("Heartbeat"); };
        heartbeat.Start();
    }

    private async Task InitializeWebViewAsync()
    {
        if (initializationStarted) return;
        initializationStarted = true;
        try
        {
            string userDataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MorningDeskWallpaper",
                "probes",
                "webview",
                Process.GetCurrentProcess().Id.ToString()
            );
            ProbeLog.Write("Creating WebView2 environment. UserDataDir=" + userDataDir);
            CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(null, userDataDir);
            ProbeLog.Write("Created WebView2 environment.");
            await webView.EnsureCoreWebView2Async(environment);
            ProbeLog.Write("Initialized WebView2 controller.");
            webView.CoreWebView2.NavigationCompleted += delegate(object sender, CoreWebView2NavigationCompletedEventArgs args)
            {
                ProbeLog.Write("Navigation completed. Success=" + args.IsSuccess + " Status=" + args.WebErrorStatus);
            };
            webView.NavigateToString(
                "<!doctype html><html><body style='margin:0;background:#102f3c;color:#d8f5ff;" +
                "font-family:Segoe UI,Arial;height:100vh;display:grid;place-items:center'>" +
                "<main style='text-align:center'><h1 style='font-size:72px;margin:0'>WebView2 probe</h1>" +
                "<p style='font-size:30px'>Wallpaper Engine application mode is rendering HTML.</p></main>" +
                "</body></html>"
            );
            ProbeLog.Write("Navigating to static HTML.");
        }
        catch (Exception error)
        {
            ProbeLog.Write(error.ToString());
        }
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
        "webview.log"
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

internal static class WebViewWallpaperProbe
{
    [STAThread]
    private static void Main()
    {
        ProbeLog.Write("Process started. Args=" + String.Join(" ", Environment.GetCommandLineArgs()));
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new WebViewProbeForm());
        ProbeLog.Write("Process stopped.");
    }
}
