// swift-tools-version: 6.1

import Foundation
import PackageDescription

let rustLibraryDirectory = ProcessInfo.processInfo.environment["MINIMAL_RUST_LIB_DIR"]
    ?? URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../target/debug").path

let package = Package(
    name: "MinimalMac",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "MinimalMac", targets: ["MinimalMac"]),
    ],
    targets: [
        .executableTarget(
            name: "MinimalMac",
            path: "Sources/MinimalMac",
            linkerSettings: [
                .unsafeFlags(["-L\(rustLibraryDirectory)", "-lminimal_ffi"]),
            ]
        ),
    ]
)
