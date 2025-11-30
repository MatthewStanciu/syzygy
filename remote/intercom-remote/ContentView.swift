//
//  ContentView.swift
//  intercom-remote
//
//  Created by Matthew Stanciu on 10/13/25.
//

import SwiftUI
import KeychainSwiftUI

struct ContentView: View {
    @State private var isToggleOn: Bool = false
    @KeychainStorage("remote") private var creds: UpstashCreds?
    
    @State private var newCredString = ""
    @State private var newCredToken = ""
    
    @State private var upstashActionError: String?

    var body: some View {
      ZStack {
        VStack {
            Text("remote").font(.romanaTitle).frame(alignment: .topLeading)
                .onLongPressGesture {
                    creds = nil
                }
          Spacer()
            if let ccreds = creds {
                SubmitView(upstashActionError: $upstashActionError, ccreds: ccreds).padding()
                FancyToggle(isOn: $isToggleOn)
                    .onChange(of: isToggleOn) { old, new in
                        Task {
                            if upstashActionError != nil {
                                return;
                            }
                            do {
                                try await updateForwardCall(!new, withCreds: ccreds)
                            } catch {
                                upstashActionError = error.localizedDescription
                                isToggleOn = old
                            }
                        }
                    }
                    .task {
                        do {
                            isToggleOn = try await fetchCurrentState(withCreds: ccreds) ?? false
                        } catch {
                            upstashActionError = error.localizedDescription
                        }
                    }
            } else {
                TextField("Token", text: $newCredToken)
                TextField("URL", text: $newCredString)
                Button("yeah") {
                    creds = UpstashCreds(upstashUrl: newCredString, upstashToken: newCredToken)
                }
            }
        }
        .alert("Failed to call Upstash", isPresented: .constant(upstashActionError != nil)) {
            Button("Ok") {
                upstashActionError = nil
            }
        } message: {
            Text("\(upstashActionError ?? "")")
        }
      }
    }
}

#Preview {
  ContentView()
}
