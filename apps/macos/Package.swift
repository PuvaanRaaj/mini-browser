// swift-tools-version: 6.1

import PackageDescription

let package = Package(
    name: "MinimalMac",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "MinimalMac", targets: ["MinimalMac"]),
    ],
    targets: [
        .executableTarget(
            name: "MinimalMac",
            path: "Sources/MinimalMac"
        ),
    ]
)
