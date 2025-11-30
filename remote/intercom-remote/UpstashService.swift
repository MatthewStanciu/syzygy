//
//  UpstashService.swift
//  intercom-remote
//
//  Created by Matthew Stanciu on 11/29/25.
//

import Foundation
import Alamofire

nonisolated
struct FlagsResponse: Codable, Sendable {
    let forwardCall: Bool
}

nonisolated struct UpstashCreds: Codable, Equatable {
    var upstashUrl: String
    var upstashToken: String
}

@MainActor
func fetchCurrentState(withCreds creds: UpstashCreds) async throws -> Bool? {
    let headers: HTTPHeaders = [
        "Authorization": "Bearer \(creds.upstashToken)",
        "Content-Type": "application/json"
    ]
    
    let response = try await AF.request(
        "\(creds.upstashUrl)/get/flags",
        method: .get,
        headers: headers
    ).validate().serializingData().value
    // i'm sorry
    let x = String(data: response, encoding: .utf8)!
    return x.contains("false")
}

// Update the forwardCall flag in Upstash
@MainActor
func updateForwardCall(_ enabled: Bool, withCreds creds: UpstashCreds) async throws {
    let headers: HTTPHeaders = [
        "Authorization": "Bearer \(creds.upstashToken)",
        "Content-Type": "application/json"
    ]
    
    let parameters: [String: Any] = [
        "forwardCall": enabled
    ]
    
    _ = try await AF.request(
        "\(creds.upstashUrl)/set/flags",
        method: .post,
        parameters: parameters,
        encoding: JSONEncoding.default,
        headers: headers
    ).validate().serializingData().value
}

@MainActor
func addNewAwestruck(_ key: String, withCreds creds: UpstashCreds) async throws {
    // have to build the request manually for this operation bc
    // alamofire wasn't happy with me setting an empty value for the key
    let command = ["SET", key.lowercased(), ""]
    let jsonData = try JSONSerialization.data(withJSONObject: command)
    
    var request = URLRequest(url: URL(string: creds.upstashUrl)!)
    request.httpMethod = "POST"
    request.httpBody = jsonData
    request.setValue("Bearer \(creds.upstashToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    _ = try await AF.request(request).validate().serializingData().value
}
