//
//  SubmitView.swift
//  intercom-remote
//
//  Created by Matthew Stanciu on 11/30/25.
//

import SwiftUI

struct SubmitView: View {
    @State private var newAwestruck = ""
    
    @Binding var upstashActionError: String?
    let ccreds: UpstashCreds

    var body: some View {
        HStack {
            TextField("add a new awestruck...", text: $newAwestruck).font(.romanaLabel).textInputAutocapitalization(.never).scrollDismissesKeyboard(.immediately)
            Button( action: {
                Task {
                    do {
                        try await addNewAwestruck(newAwestruck, withCreds: ccreds)
                        newAwestruck.removeAll()
                    } catch {
                        upstashActionError = error.localizedDescription
                    }
                }
            }) {
                Image(systemName: "arrow.up.circle")
            }.font(.title2)
        }.padding().overlay(Capsule().stroke(Color.primary, lineWidth: 2))
    }
}

#Preview {
    SubmitView(upstashActionError: .constant(nil), ccreds: UpstashCreds(upstashUrl: .init(), upstashToken: .init()))
}
