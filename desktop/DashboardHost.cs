using System;
using System.Diagnostics;
using System.Drawing;
using System.Net;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;

internal sealed class DashboardForm : Form
{
    private const int Port = 43761;
    private readonly WebView2 webView = new WebView2();
    private Process backend;

    public DashboardForm()
    {
        Text = "Morning Desk Dashboard";
        BackColor = Color.Black;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        WindowState = FormWindowState.Maximized;
        KeyPreview = true;
        webView.Dock = DockStyle.Fill;
        Controls.Add(webView);
        Shown += async delegate { await StartDashboardAsync(); };
        FormClosed += delegate { StopOwnedBackend(); };
        KeyDown += delegate(object sender, KeyEventArgs args)
        {
            if (args.KeyCode == Keys.Escape) Close();
        };
    }

    private async Task StartDashboardAsync()
    {
        if (!await IsBackendReadyAsync())
        {
            backend = Process.Start(new ProcessStartInfo
            {
                FileName = "MorningDeskBackend.exe",
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory
            });
        }

        for (int attempt = 0; attempt < 40 && !await IsBackendReadyAsync(); attempt++)
            await Task.Delay(250);

        await webView.EnsureCoreWebView2Async();
        webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
        webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
        webView.CoreWebView2.Navigate("http://127.0.0.1:" + Port + "/lifestyle.html");
    }

    private static async Task<bool> IsBackendReadyAsync()
    {
        try
        {
            using (WebClient client = new WebClient())
            {
                client.Headers.Add("Cache-Control", "no-cache");
                await client.DownloadStringTaskAsync("http://127.0.0.1:" + Port + "/api/health");
                return true;
            }
        }
        catch
        {
            return false;
        }
    }

    private void StopOwnedBackend()
    {
        if (backend == null || backend.HasExited) return;
        try { backend.Kill(); } catch { }
    }
}

internal static class DashboardHost
{
    [STAThread]
    private static void Main()
    {
        bool created;
        using (Mutex mutex = new Mutex(true, @"Local\MorningDeskDashboard.Host", out created))
        {
            if (!created) return;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new DashboardForm());
        }
    }
}
