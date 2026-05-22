import CoreLocation
import MapKit
import SwiftUI

private enum NearbySheetDetent: CaseIterable {
    case collapsed
    case medium
    case expanded

    func height(in containerHeight: CGFloat) -> CGFloat {
        let height = max(containerHeight, 1)
        switch self {
        case .collapsed:
            return min(max(252, height * 0.30), height * 0.42)
        case .medium:
            return min(max(430, height * 0.52), height * 0.68)
        case .expanded:
            return max(height - 58, height * 0.93)
        }
    }
}

private enum NearbyStyle {
    static let panel = ManwonColor.surface
    static let card = Color(red: 0.985, green: 0.985, blue: 0.99)
    static let cardSoft = Color(red: 0.975, green: 0.975, blue: 0.982)
    static let mapControl = ManwonColor.surface.opacity(0.96)
    static let text = ManwonColor.text
    static let muted = ManwonColor.muted
}

@MainActor
final class LocationProvider: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var coordinate = CLLocationCoordinate2D(latitude: 37.5009, longitude: 127.0365)
    @Published var authorizationDenied = false

    private let manager = CLLocationManager()

    var authorizationStatus: CLAuthorizationStatus {
        manager.authorizationStatus
    }

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func refreshAuthorizationState() {
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            authorizationDenied = false
            manager.requestLocation()
        case .denied, .restricted:
            authorizationDenied = true
        default:
            authorizationDenied = false
        }
    }

    func requestSystemLocation() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            authorizationDenied = false
            manager.requestLocation()
        case .denied, .restricted:
            authorizationDenied = true
        @unknown default:
            break
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        refreshAuthorizationState()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        coordinate = location.coordinate
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("Location error: \(error.localizedDescription)")
    }
}

@MainActor
final class NearbyViewModel: ObservableObject {
    @Published var posts: [TaskPost] = []
    @Published var selectedPostId: String?
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 37.5009, longitude: 127.0365),
        span: MKCoordinateSpan(latitudeDelta: 0.018, longitudeDelta: 0.018)
    )

    var selectedPost: TaskPost? {
        if let selectedPostId, let post = posts.first(where: { $0.id == selectedPostId }) {
            return post
        }
        return posts.first
    }

    var mapPosts: [TaskPost] {
        posts.filter { $0.coordinate != nil }
    }

    func load(latitude: Double, longitude: Double) async {
        isLoading = true
        region.center = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        do {
            posts = try await APIClient.shared.fetchNearbyPosts(latitude: latitude, longitude: longitude)
            if selectedPostId == nil || !posts.contains(where: { $0.id == selectedPostId }) {
                selectedPostId = posts.first?.id
            }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

struct NearbyView: View {
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var permissionPrompts: PermissionPromptManager
    @StateObject private var locationProvider = LocationProvider()
    @StateObject private var viewModel = NearbyViewModel()
    @State private var sheetDetent: NearbySheetDetent = .medium
    @GestureState private var sheetDragTranslation: CGFloat = 0

    var body: some View {
        GeometryReader { geometry in
            let currentHeight = sheetHeight(in: geometry.size.height)
            let bottomSafeArea = geometry.safeAreaInsets.bottom

            ZStack(alignment: .bottom) {
                Map(coordinateRegion: $viewModel.region, annotationItems: viewModel.mapPosts) { post in
                    MapAnnotation(coordinate: post.coordinate!) {
                        Button {
                            withAnimation(.interactiveSpring(response: 0.32, dampingFraction: 0.88)) {
                                viewModel.selectedPostId = post.id
                                sheetDetent = .collapsed
                            }
                        } label: {
                            Text("\(max(1, min(99, post.price / 1000)))")
                                .font(.system(size: 12, weight: .black))
                                .foregroundStyle(viewModel.selectedPostId == post.id ? Color.white : ManwonColor.brand)
                                .frame(width: 38, height: 38)
                                .background(viewModel.selectedPostId == post.id ? ManwonColor.brand : ManwonColor.surface)
                                .clipShape(Circle())
                                .overlay(Circle().stroke(ManwonColor.brand, lineWidth: 2))
                                .shadow(color: .black.opacity(0.16), radius: 8, x: 0, y: 4)
                        }
                    }
                }
                .ignoresSafeArea()
                .overlay(Color.white.opacity(sheetDetent == .expanded ? 0.02 : 0.08).allowsHitTesting(false))

                Button {
                    requestNearbyLocation()
                } label: {
                    Image(systemName: "location.fill")
                        .font(.system(size: 19, weight: .bold))
                        .foregroundStyle(ManwonColor.brand)
                        .frame(width: 48, height: 48)
                        .background(NearbyStyle.mapControl)
                        .clipShape(Circle())
                        .shadow(color: .black.opacity(0.14), radius: 10, x: 0, y: 5)
                }
                .buttonStyle(PressableScaleButtonStyle(scale: 0.94, pressedOpacity: 0.9))
                .padding(.top, 58)
                .padding(.trailing, 18)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .opacity(sheetDetent == .expanded ? 0 : 1)

                Button {
                    withAnimation(ManwonMotion.select) {
                        router.openWebPath("/register")
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "plus")
                            .font(.system(size: 25, weight: .semibold))
                        if sheetDetent != .collapsed {
                            Text("글쓰기")
                                .font(.system(size: 17, weight: .bold))
                        }
                    }
                    .foregroundStyle(Color.white)
                    .frame(width: sheetDetent == .collapsed ? 72 : nil, height: 58)
                    .padding(.horizontal, sheetDetent == .collapsed ? 0 : 20)
                    .background(ManwonColor.brand)
                    .clipShape(Capsule())
                    .shadow(color: ManwonColor.brand.opacity(0.26), radius: 16, x: 0, y: 8)
                }
                .buttonStyle(PressableScaleButtonStyle(scale: 0.94, pressedOpacity: 0.9))
                .padding(.trailing, 22)
                .padding(.bottom, currentHeight + 24)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                .opacity(sheetDetent == .expanded ? 0 : 1)
                .animation(.interactiveSpring(response: 0.28, dampingFraction: 0.88), value: currentHeight)

                VStack(spacing: 0) {
                    NearbySheetGrabber()
                        .padding(.top, 10)
                        .padding(.bottom, 12)
                        .contentShape(Rectangle())
                        .gesture(sheetDragGesture(in: geometry.size.height))

                    NearbySheetHeader(
                        count: viewModel.posts.count,
                        subtitle: locationProvider.authorizationDenied ? "위치 권한을 허용하면 더 정확해요" : "내 위치 기준 1km"
                    )
                    .padding(.horizontal, 20)
                    .padding(.bottom, 14)
                    .contentShape(Rectangle())
                    .gesture(sheetDragGesture(in: geometry.size.height))

                    NearbySheetBody(
                        viewModel: viewModel,
                        detent: sheetDetent,
                        selectPost: { post in
                            withAnimation(.interactiveSpring(response: 0.28, dampingFraction: 0.88)) {
                                viewModel.selectedPostId = post.id
                            }
                        },
                        openPost: { post in
                            router.openWebPath("/posts/\(post.id)")
                        },
                        retry: reloadNearby
                    )
                }
                .frame(maxWidth: .infinity)
                .frame(height: currentHeight, alignment: .top)
                .padding(.bottom, bottomSafeArea)
                .background(NearbyStyle.panel)
                .clipShape(
                    UnevenRoundedRectangle(
                        topLeadingRadius: 26,
                        bottomLeadingRadius: 0,
                        bottomTrailingRadius: 0,
                        topTrailingRadius: 26,
                        style: .continuous
                    )
                )
                .shadow(color: .black.opacity(0.12), radius: 24, x: 0, y: -8)
                .clipped()
                .offset(y: bottomSafeArea)
                .animation(.interactiveSpring(response: 0.32, dampingFraction: 0.88), value: sheetDetent)
            }
            .background(ManwonColor.background)
            .task {
                locationProvider.refreshAuthorizationState()
                await viewModel.load(
                    latitude: locationProvider.coordinate.latitude,
                    longitude: locationProvider.coordinate.longitude
                )
            }
            .onChange(of: locationProvider.coordinate.latitude) { _ in
                Task {
                    await viewModel.load(
                        latitude: locationProvider.coordinate.latitude,
                        longitude: locationProvider.coordinate.longitude
                    )
                }
            }
            .onAppear {
                syncBottomNavCoverState()
            }
            .onDisappear {
                router.nearbySheetCoversBottomNav = false
            }
            .onChange(of: sheetDetent) { _ in
                syncBottomNavCoverState()
            }
            .onChange(of: sheetDragTranslation) { _ in
                syncBottomNavCoverState()
            }
        }
    }

    private func reloadNearby() {
        requestNearbyLocation()
        Task {
            await viewModel.load(
                latitude: locationProvider.coordinate.latitude,
                longitude: locationProvider.coordinate.longitude
            )
        }
    }

    private func requestNearbyLocation() {
        permissionPrompts.requestLocation(
            context: .nearby,
            authorizationStatus: locationProvider.authorizationStatus
        ) {
            locationProvider.requestSystemLocation()
        }
    }

    private func sheetHeight(in containerHeight: CGFloat) -> CGFloat {
        let minHeight = NearbySheetDetent.collapsed.height(in: containerHeight)
        let maxHeight = NearbySheetDetent.expanded.height(in: containerHeight)
        let proposed = sheetDetent.height(in: containerHeight) - sheetDragTranslation
        return min(max(proposed, minHeight), maxHeight)
    }

    private func syncBottomNavCoverState() {
        router.nearbySheetCoversBottomNav = sheetDetent != .collapsed || sheetDragTranslation < -8
    }

    private func sheetDragGesture(in containerHeight: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 3, coordinateSpace: .global)
            .updating($sheetDragTranslation) { value, state, _ in
                state = value.translation.height
            }
            .onEnded { value in
                let targetHeight = sheetDetent.height(in: containerHeight) - value.predictedEndTranslation.height
                let nextDetent = NearbySheetDetent.allCases.min {
                    abs($0.height(in: containerHeight) - targetHeight) < abs($1.height(in: containerHeight) - targetHeight)
                } ?? sheetDetent

                withAnimation(.interactiveSpring(response: 0.32, dampingFraction: 0.88, blendDuration: 0.1)) {
                    sheetDetent = nextDetent
                }
            }
    }
}

private struct NearbySheetGrabber: View {
    var body: some View {
        Capsule()
            .fill(ManwonColor.line)
            .frame(width: 45, height: 5)
            .frame(maxWidth: .infinity)
    }
}

private struct NearbySheetHeader: View {
    let count: Int
    let subtitle: String

    var body: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                Text("주변 부탁 \(count)개")
                    .font(.system(size: 19, weight: .black))
                    .foregroundStyle(NearbyStyle.text)
                Text(subtitle)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(NearbyStyle.muted)
            }
            Spacer()
        }
    }
}

private struct NearbySheetBody: View {
    @ObservedObject var viewModel: NearbyViewModel
    let detent: NearbySheetDetent
    let selectPost: (TaskPost) -> Void
    let openPost: (TaskPost) -> Void
    let retry: () -> Void

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var body: some View {
        Group {
            if viewModel.isLoading {
                ProgressView()
                    .tint(ManwonColor.brand)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage = viewModel.errorMessage {
                VStack(spacing: 12) {
                    Text(errorMessage)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(NearbyStyle.muted)
                        .multilineTextAlignment(.center)
                    Button("다시 불러오기", action: retry)
                        .buttonStyle(PrimaryButtonStyle())
                }
                .padding(22)
            } else if viewModel.posts.isEmpty {
                VStack(spacing: 8) {
                    Text("근처에 열린 부탁이 없어요")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(NearbyStyle.text)
                    Text("범위를 넓히거나 홈에서 다른 부탁을 확인해보세요.")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(NearbyStyle.muted)
                }
                .padding(22)
            } else {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        if let selected = viewModel.selectedPost {
                            NearbyFeaturedPostCard(post: selected) {
                                openPost(selected)
                            }
                        }

                        Text("이런 부탁이 올라왔어요")
                            .font(.system(size: 24, weight: .black))
                            .foregroundStyle(NearbyStyle.text)
                            .padding(.top, detent == .collapsed ? 0 : 2)

                        LazyVGrid(columns: columns, spacing: 16) {
                            ForEach(viewModel.posts) { post in
                                NearbyPostRow(post: post, selected: post.id == viewModel.selectedPost?.id) {
                                    openPost(post)
                                }
                                .onTapGesture {
                                    selectPost(post)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 132)
                }
                .scrollDisabled(detent == .collapsed)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .animation(ManwonMotion.fade, value: viewModel.isLoading)
        .animation(ManwonMotion.fade, value: viewModel.posts.count)
    }
}

private struct NearbyFeaturedPostCard: View {
    let post: TaskPost
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(ManwonColor.brandSoft)
                    Image(systemName: post.postType == "offer" ? "hand.raised.fill" : "bag.fill")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(ManwonColor.brand)
                }
                .frame(width: 58, height: 58)

                VStack(alignment: .leading, spacing: 6) {
                    Text(post.title)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(NearbyStyle.text)
                        .lineLimit(2)
                    Text("\(post.distanceText) · \(post.priceText)")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(NearbyStyle.muted)
                }
                Spacer()
            }
            .padding(16)
            .background(NearbyStyle.card)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(PressableScaleButtonStyle(scale: 0.97, pressedOpacity: 0.9))
    }
}

private struct NearbyPostRow: View {
    let post: TaskPost
    let selected: Bool
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 10) {
                NearbyPostThumbnail(post: post)

                Text(post.title)
                    .font(.system(size: 15, weight: .black))
                    .foregroundStyle(NearbyStyle.text)
                    .lineLimit(2)

                Text("\(post.distanceText) · \(post.categoryDetail ?? post.category ?? "부탁")")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(NearbyStyle.muted)
                    .lineLimit(1)

                Text(post.priceText)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(ManwonColor.brand)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
            .background(selected ? ManwonColor.brandSoft : NearbyStyle.cardSoft)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(selected ? ManwonColor.brand.opacity(0.35) : ManwonColor.line, lineWidth: 1)
            )
        }
        .buttonStyle(PressableScaleButtonStyle(scale: 0.97, pressedOpacity: 0.9))
    }
}

private struct NearbyPostThumbnail: View {
    let post: TaskPost

    var body: some View {
        ZStack {
            if
                let imageUrl = post.images?.first?.imageUrl,
                let absolute = APIClient.shared.absoluteURLString(imageUrl),
                let url = URL(string: absolute)
            {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(1, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
    }

    private var placeholder: some View {
        ZStack {
            LinearGradient(
                colors: [ManwonColor.brand.opacity(0.9), Color(red: 1.0, green: 0.66, blue: 0.42)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Image(systemName: post.postType == "offer" ? "hand.raised.fill" : "bag.fill")
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(Color.white)
        }
    }
}
