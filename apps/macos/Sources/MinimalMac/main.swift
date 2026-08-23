import AppKit
import WebKit

@main
struct MinimalMacMain {
    @MainActor
    static func main() {
        let application = NSApplication.shared
        let delegate = ApplicationDelegate()
        application.delegate = delegate
        application.setActivationPolicy(.regular)
        application.run()
    }
}

@MainActor
final class ApplicationDelegate: NSObject, NSApplicationDelegate {
    private var browserWindow: BrowserWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let controller = BrowserWindowController()
        browserWindow = controller
        controller.showWindow(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}

@MainActor
final class BrowserWindowController: NSWindowController, WKNavigationDelegate, WKUIDelegate,
    NSSearchFieldDelegate
{
    private let rootView = NSView()
    private let contentView = NSView()
    private let startView = NSStackView()
    private let omnibox = NSSearchField()
    private let backButton = NSButton()
    private let forwardButton = NSButton()
    private let reloadButton = NSButton()
    private var pageView: WKWebView?

    convenience init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1_280, height: 860),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Minimal"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.minSize = NSSize(width: 720, height: 480)
        window.center()
        self.init(window: window)
    }

    override func windowDidLoad() {
        super.windowDidLoad()
        guard let window else { return }

        configureViews()
        window.contentView = rootView
        window.makeFirstResponder(omnibox)
    }

    private func configureViews() {
        rootView.translatesAutoresizingMaskIntoConstraints = false
        contentView.translatesAutoresizingMaskIntoConstraints = false
        rootView.addSubview(contentView)

        let chrome = NSStackView()
        chrome.orientation = .horizontal
        chrome.alignment = .centerY
        chrome.spacing = 8
        chrome.edgeInsets = NSEdgeInsets(top: 8, left: 12, bottom: 8, right: 12)
        chrome.translatesAutoresizingMaskIntoConstraints = false
        rootView.addSubview(chrome)

        configure(button: backButton, symbol: "chevron.left", label: "Back", action: #selector(goBack))
        configure(
            button: forwardButton,
            symbol: "chevron.right",
            label: "Forward",
            action: #selector(goForward)
        )
        configure(
            button: reloadButton,
            symbol: "arrow.clockwise",
            label: "Reload",
            action: #selector(reload)
        )

        omnibox.placeholderString = "Search or enter address"
        omnibox.delegate = self
        omnibox.target = self
        omnibox.action = #selector(submitOmnibox)
        omnibox.sendsSearchStringImmediately = false
        omnibox.setAccessibilityLabel("Address and search")

        chrome.addArrangedSubview(backButton)
        chrome.addArrangedSubview(forwardButton)
        chrome.addArrangedSubview(reloadButton)
        chrome.addArrangedSubview(omnibox)

        let wordmark = NSTextField(labelWithString: "Minimal")
        wordmark.font = .systemFont(ofSize: 30, weight: .semibold)
        wordmark.alignment = .center
        let promise = NSTextField(labelWithString: "A fast, private browser that gets out of the way.")
        promise.font = .systemFont(ofSize: 14)
        promise.textColor = .secondaryLabelColor
        promise.alignment = .center

        startView.orientation = .vertical
        startView.alignment = .centerX
        startView.spacing = 10
        startView.translatesAutoresizingMaskIntoConstraints = false
        startView.addArrangedSubview(wordmark)
        startView.addArrangedSubview(promise)
        contentView.addSubview(startView)

        NSLayoutConstraint.activate([
            chrome.topAnchor.constraint(equalTo: rootView.safeAreaLayoutGuide.topAnchor),
            chrome.leadingAnchor.constraint(equalTo: rootView.leadingAnchor),
            chrome.trailingAnchor.constraint(equalTo: rootView.trailingAnchor),
            chrome.heightAnchor.constraint(greaterThanOrEqualToConstant: 48),
            omnibox.widthAnchor.constraint(greaterThanOrEqualToConstant: 320),

            contentView.topAnchor.constraint(equalTo: chrome.bottomAnchor),
            contentView.leadingAnchor.constraint(equalTo: rootView.leadingAnchor),
            contentView.trailingAnchor.constraint(equalTo: rootView.trailingAnchor),
            contentView.bottomAnchor.constraint(equalTo: rootView.bottomAnchor),

            startView.centerXAnchor.constraint(equalTo: contentView.centerXAnchor),
            startView.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
        ])

        updateNavigationControls()
    }

    private func configure(button: NSButton, symbol: String, label: String, action: Selector) {
        button.image = NSImage(systemSymbolName: symbol, accessibilityDescription: label)
        button.imagePosition = .imageOnly
        button.bezelStyle = .texturedRounded
        button.target = self
        button.action = action
        button.toolTip = label
        button.setAccessibilityLabel(label)
    }

    @objc private func submitOmnibox() {
        guard let destination = NavigationInput.resolve(omnibox.stringValue) else { return }
        navigate(to: destination)
    }

    private func navigate(to url: URL) {
        let webView = ensurePageView()
        omnibox.stringValue = url.absoluteString
        webView.load(URLRequest(url: url))
        webView.window?.makeFirstResponder(webView)
    }

    private func ensurePageView() -> WKWebView {
        if let pageView { return pageView }

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        // Intentionally add no WKScriptMessageHandler or native host object.
        // Remote pages have no application bridge.
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.setAccessibilityLabel("Web page")

        startView.isHidden = true
        contentView.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: contentView.topAnchor),
            webView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
        ])
        pageView = webView
        return webView
    }

    @objc private func goBack() {
        pageView?.goBack()
    }

    @objc private func goForward() {
        pageView?.goForward()
    }

    @objc private func reload() {
        pageView?.reload()
    }

    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector)
        -> Bool
    {
        guard commandSelector == #selector(NSResponder.insertNewline(_:)) else { return false }
        submitOmnibox()
        return true
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        updateNavigationControls()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        omnibox.stringValue = webView.url?.absoluteString ?? omnibox.stringValue
        window?.title = webView.title ?? "Minimal"
        updateNavigationControls()
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        updateNavigationControls()
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if ["http", "https", "about"].contains(url.scheme?.lowercased() ?? "") {
            decisionHandler(.allow)
            return
        }
        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
    }

    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void
    ) {
        decisionHandler(.deny)
    }

    private func updateNavigationControls() {
        backButton.isEnabled = pageView?.canGoBack ?? false
        forwardButton.isEnabled = pageView?.canGoForward ?? false
        reloadButton.isEnabled = pageView != nil
    }
}

enum NavigationInput {
    static func resolve(_ raw: String) -> URL? {
        let input = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { return nil }

        if let explicit = URL(string: input), let scheme = explicit.scheme, !scheme.isEmpty {
            return explicit
        }

        let looksLikeHost = !input.contains(" ")
            && (input.contains(".") || input == "localhost" || input.hasPrefix("localhost:"))
        if looksLikeHost {
            return URL(string: "https://\(input)")
        }

        var components = URLComponents(string: "https://duckduckgo.com/")
        components?.queryItems = [URLQueryItem(name: "q", value: input)]
        return components?.url
    }
}
