import SwiftUI

struct FancyToggle: View {
    @Binding var isOn: Bool
    @State var toggleSize: CGSize = .zero

    var body: some View {
        ChildSizeReader(size: $toggleSize) {
            Toggle(isOn: $isOn) {
                Text("bruh")
            }.labelsHidden().scaleEffect(6).offset(x: -6)
        }.frame(width: 6 * toggleSize.width, height: 6 * toggleSize.height)
    }
}

struct ChildSizeReader<Content: View>: View {
    @Binding var size: CGSize
    let content: () -> Content
    var body: some View {
        ZStack {
            content()
                .background(
                    GeometryReader { proxy in
                        Color.clear
                            .preference(key: SizePreferenceKey.self, value: proxy.size)
                    }
                )
        }
        .onPreferenceChange(SizePreferenceKey.self) { preferences in
            self.size = preferences
        }
    }
}

struct SizePreferenceKey: PreferenceKey {
    typealias Value = CGSize
    static var defaultValue: Value = .zero

    static func reduce(value _: inout Value, nextValue: () -> Value) {
        _ = nextValue()
    }
}


#Preview {
    @Previewable @State var isOn: Bool = false
    FancyToggle(isOn: $isOn)
}
