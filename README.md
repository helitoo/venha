# 🚦 VENHA - HỆ THỐNG GIÁM SÁT CAMERA GIAO THÔNG & CHẨN ĐOÁN NGẬP LỤT TP. HỒ CHÍ MINH

Hệ thống bản đồ trực quan hóa hơn **790+ Camera giao thông** thực tế tại TP. Hồ Chí Minh trên nền tảng bản đồ số tương tác cao, tích hợp dự báo thời tiết cục bộ thời gian thực và phân tích mức độ ngập úng đô thị thông minh bằng **Google Gemini Multimodal AI**.

---

## 🌟 TÍNH NĂNG NỔI BẬT

- 🗺️ **Bản đồ Camera Full màn hình**: Tích hợp dữ liệu 796 camera giao thông với tọa độ GPS chính xác, hỗ trợ chuyển đổi lớp bản đồ Đường phố / Vệ tinh Google Maps.
- ⚡ **0ms Cold-Start SSR Hydration**: Trạng thái thời tiết và cảnh báo ngập của toàn bộ 796 camera được nạp sẵn ngay từ máy chủ (Server Component), người dùng mở trang có dữ liệu ngay lập tức mà không cần fetch lại từ đầu.
- ⏱️ **Đồng bộ Countdown Toàn cầu (Global Epoch Time)**: Đồng hồ đếm lùi chu kỳ thời tiết & ngập lụt được tính toán theo mốc Unix Epoch tuyệt đối, đảm bảo mọi client trên thế giới luôn đếm đúng cùng một nhịp giây.
- 🎯 **Viewport Culling (Tối ưu 60 FPS)**: Chỉ kích hoạt nạp luồng ảnh cho các camera thực sự nằm trong khung nhìn bản đồ với vùng đệm buffer 15%.
- 🛡️ **4 Tầng Phòng Vệ Tiết Kiệm Token AI**: Cơ chế Weather Gating, State TTL Cooldown (10 phút), Image Stream Check và Micro-batching (35 ảnh/request) giúp triệt tiêu hoàn toàn việc lạm dụng API Gemini.
- 🌦️ **Dự báo thời tiết cục bộ Open-Meteo & Gom cụm Haversine**: Gom 796 camera theo bán kính không gian để lấy mẫu đại diện, giảm hơn 95% request mạng.
- 🚀 **Tối ưu hóa Vercel Serverless**: Kiến trúc In-Memory SWR Cache kết hợp Serverless Edge Handlers giúp chia sẻ 1 kết quả tính toán cho hàng nghìn người dùng truy cập đồng thời.

---

## 🏛️ KIẾN TRÚC TỔNG QUAN HỆ THỐNG (SYSTEM ARCHITECTURE)

Hệ thống hoạt động theo mô hình phân tách 2 luồng độc lập giữa **Server-side (Thời tiết & Ngập lụt)** và **Client-side (Hình ảnh Camera)**:

```mermaid
flowchart TD
    subgraph SERVER["1. LUỒNG MÁY CHỦ (SERVER-SIDE & SWR CACHE)"]
        A["Khởi tạo Trang / SSR Request"] --> B["src/app/page.tsx (Server Component)"]
        B --> C["getAggregatedWeatherFloodState()"]
        C --> D{"Kiểm tra Server SWR Cache<br/>(Hạn < 60s?)"}
        D -->|Cache Hit| E["Trả về State ngay lập tức (0ms)"]
        D -->|Cache Miss / Hết hạn| F["Gom cụm không gian Haversine"]
        F --> G["Batch Query Open-Meteo (100 coords/req)"]
        G --> H["Phân phối thời tiết cho 796 camera"]
        H --> I["Kiểm tra State TTL Cooldown (10 phút)"]
        I --> J["Lưu State vào globalThis Singleton Cache"]
        J --> E
        E --> K["Nhúng sẵn vào HTML (SSR Hydration)"]
    end

    subgraph CLIENT["2. LUỒNG CLIENT-SIDE & ĐỒNG BỘ TOÀN CẦU"]
        K --> L["Client hiển thị ngay 796 Node Camera"]
        M["Unix Epoch Time (Date.now())"] --> N["Countdown Đồng bộ Toàn cầu"]
        N -->|Khi chạm 0s| O["GET /api/weather"]
        O --> J
        
        P["Người dùng Pan / Zoom Bản đồ"] --> Q["Viewport Culling (Bounds + 15% Buffer)"]
        Q -->|Đăng ký Camera trong tầm nhìn| R["GET /api/proxy?id={camId}&t={timestamp}"]
        R --> S["Cổng Camera Giao thông TP.HCM"]
        S -->|Thành công| T["Stream ảnh JPEG lên UI"]
        S -->|Lỗi Socket / Đóng cổng| U["Fallback ảnh SVG 'Mất tín hiệu'"]
    end
```

---

## 🔄 1. CƠ CHẾ ĐỒNG BỘ THỜI TIẾT & COUNTDOWN TOÀN CẦU

### A. Công thức đồng bộ Countdown theo Unix Epoch
Thay vì dùng `setInterval` đếm lùi độc lập trong từng trình duyệt (gây lệch giây khi người dùng F5 hoặc mở tab ở các thời điểm khác nhau), hệ thống tính toán đồng hồ đếm ngược trực tiếp từ thời gian Epoch toàn cầu:

$$\text{elapsed} = \lfloor \text{Date.now()} / 1000 \rfloor \pmod{\text{NEXT\_PUBLIC\_FLOOD\_INTERVAL}}$$
$$\text{countdown} = \text{NEXT\_PUBLIC\_FLOOD\_INTERVAL} - \text{elapsed}$$

* **Đặc tính:** Tất cả client tại mọi vị trí địa lý đều đếm lùi chính xác cùng 1 nhịp giây với máy chủ.
* Khi `countdown === NEXT_PUBLIC_FLOOD_INTERVAL` (bắt đầu chu kỳ mới), client tự động gọi `GET /api/weather` để nhận bản cập nhật mới nhất.

### B. Thuật toán Gom cụm Không gian Haversine (Spatial Clustering)
* Áp dụng công thức khoảng cách mặt cầu Haversine để nhóm 796 camera thành các cụm đại diện bán kính không gian $R$:
  $$d = 2R_{\text{earth}} \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\text{lat}}{2}\right) + \cos(\text{lat}_1)\cos(\text{lat}_2)\sin^2\left(\frac{\Delta\text{lng}}{2}\right)}\right)$$
* Giảm số lượng điểm truy vấn Open-Meteo từ **796 điểm xuống các trạm đại diện theo cụm**, giảm tải hơn 95% request mạng và tránh bị giới hạn API rate limit.

---

## 🧠 2. MÔ HÌNH 4 TẦNG PHÒNG VỆ CHỐNG LẠM DỤNG GEMINI AI

Để kiểm soát chặt chẽ chi phí token và tránh lạm dụng API Google Gemini, hệ thống triển khai kiến trúc **4 tầng phòng vệ (Defense-in-Depth)**:

```mermaid
flowchart TD
    A["Chu kỳ quét 796 Camera"] --> B{"Tầng 1: Weather Gating<br/>(Kiểm tra mã Open-Meteo)"}
    
    B -->|"Thời tiết Khô ráo / Mưa nhỏ (WMO 61,63,65)"| C["Gán LEVEL_0 (Khô ráo)<br/>⚡ 0 Token - 0 API Call"]
    
    B -->|"Mưa to / Giông bão (WMO 80,81,82,95,96,99)"| D{"Tầng 2: State TTL Cooldown<br/>(Đã phân tích < 10 phút trước?)"}
    
    D -->|Vẫn trong hạn TTL| E["Tái sử dụng State cũ từ Cache<br/>⚡ 0 Token - 0 API Call"]
    
    D -->|Hết TTL hoặc Chưa có kết quả| F{"Tầng 3: Image Stream Check<br/>(Camera có ảnh hợp lệ?)"}
    
    F -->|Mất kết nối / Không có ảnh| G["Gán LEVEL_0 thông báo an toàn<br/>⚡ 0 Token - 0 API Call"]
    
    F -->|Có ảnh JPEG hợp lệ| H["Tầng 4: Micro-Batching (Gom 35 ảnh/req)<br/>Gửi 1 request duy nhất tới Gemini"]
    
    H --> I["Lưu vào Server State Cache"]
    C --> I
    E --> I
    G --> I
    I --> J["Phát tán đồng thời cho hàng nghìn người dùng"]
```

1. **Tầng 1 - Weather Gating:** Tuyệt đối không gọi Gemini cho các camera ở vùng không mưa hoặc mưa nhỏ (`61, 63, 65`). Tự động gán `LEVEL_0` với **0 token**.
2. **Tầng 2 - State TTL Cooldown (`GEMINI_FLOOD_TTL_MINUTES=10`):** Mức ngập lụt không thay đổi theo từng giây. Kết quả phân tích được giữ nguyên trong **10 phút**. Trong suốt thời gian này, các chu kỳ quét 60s tiếp theo kế thừa lại kết quả cũ mà **không gọi lại Gemini**.
3. **Tầng 3 - Image Availability Check:** Chỉ gửi ảnh sang Gemini khi camera đang hoạt động và có luồng ảnh thực tế. Bỏ qua các camera mất tín hiệu.
4. **Tầng 4 - Micro-Batching ($35\text{ ảnh/request}$):** Đóng gói tối đa 35 camera vào một mảng Multimodal Array duy nhất theo định dạng JSON Structured Output, giảm hơn 80% chi phí token so với gọi đơn lẻ.
5. **Tập trung hóa Server (Centralized Pipeline):** Người dùng không được gọi trực tiếp Gemini từ trình duyệt. Dù có **1.000 người dùng cùng online**, máy chủ cũng chỉ gọi AI **1 lần duy nhất** và chia sẻ state cho tất cả.

---

## 📸 3. CƠ CHẾ FETCH HÌNH ẢNH CAMERA & PROXY

### A. Viewport Culling & Buffer Padding
* Bản đồ Leaflet chỉ kích hoạt nạp ảnh cho các camera nằm trong vùng hiển thị hiện tại cộng thêm 15% viền đệm (`map.getBounds().pad(0.15)`).
* Khi camera trượt ra ngoài khung nhìn, luồng nạp ảnh tự động tạm dừng để giải phóng tài nguyên.
* Countdown làm mới ảnh chạy độc lập theo từng client (`NEXT_PUBLIC_CAMERA_REFRESH_INTERVAL=30s`).

### B. Xử lý Proxy & Fallback Mất tín hiệu ([`src/app/api/proxy/route.ts`](file:///d:/PROJECT/venha/venha/src/app/api/proxy/route.ts))
* Client yêu cầu ảnh qua proxy: `/api/proxy?id={camId}&t={timestamp}`.
* **Negative Caching & Backoff (3 phút):** Khi cổng giao thông TP.HCM đóng socket hoặc ngắt kết nối TLS, proxy tự động đặt cờ hoãn 3 phút, triệt tiêu hoàn toàn hiện tượng spam log lỗi trên máy chủ.
* **SVG Fallback:** Tự động trả về hình ảnh vector SVG *"Mất tín hiệu"* hiển thị gọn gàng trên bản đồ.

---

## 🎨 4. QUY TẮC MÀU SẮC & TRẠNG THÁI NODE CAMERA

Node camera dạng tròn $24\times24\text{ px}$ thể hiện trực quan cấp độ ngập và ký hiệu thời tiết:

| Trạng thái màu | Cấp độ ngập | Điều kiện kích hoạt | Ý nghĩa thực tế |
| :--- | :---: | :--- | :--- |
| 🟢 **Màu xanh lá** (`#059669`) | **Level 0 (Mặc định)** | Thời tiết khô ráo, mưa nhỏ (61/63/65) hoặc tuyến đường không ngập | Tuyến đường thông suốt, an toàn |
| 🟡 **Màu vàng cam** (`#f59e0b`) | **Level 1** | Sau khi phân tích AI xác nhận | Ngập nhẹ mép vỉa hè ($< 15\text{ cm}$) |
| 🟠 **Màu cam đỏ** (`#ea580c`) | **Level 2** | Sau khi phân tích AI xác nhận | Ngập vừa nửa bánh xe ($15 - 40\text{ cm}$) |
| 🔴 **Màu đỏ nhấp nháy** (`#e11d48`) | **Level 3** | Sau khi phân tích AI xác nhận | **Báo động ngập sâu ($> 40\text{ cm}$), nguy cơ chết máy** |

### Ký hiệu thời tiết bên trong Node (Mã WMO):
* 🍃 **Lá cây (Khô ráo)**: Thời tiết quang mây, nắng ráo, không mưa.
* 💧 **Giọt nước (Mưa)**: Mưa nhỏ, mưa vừa rải rác (WMO `61, 63, 65`).
* 🌧️ **Đám mây mưa (Mưa rào)**: Mưa rào diện rộng, mưa nặng hạt (WMO `80, 81, 82`).
* ⚡ **Lốc xoáy / Sấm sét (Giông bão)**: Giông sét kèm gió giật và mưa đá (WMO `95, 96, 99`).

---

## ⚙️ 5. CẤU HÌNH BIẾN MÔI TRƯỜNG (.env)

Tạo file `.env` tại thư mục gốc dự án:

```env
# ==========================================
# 1. Cấu hình Gemini AI (Phân tích ngập lụt)
# ==========================================
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemma-4-26b-a4b-it
GEMINI_FALLBACK_MODEL=gemini-3.5-flash
GEMINI_MEDIA_RESOLUTION=MEDIA_RESOLUTION_LOW
GEMINI_BATCH_SIZE=35

# Thời gian lưu giữ kết quả phân tích AI trước khi quét lại (tính theo phút, mặc định 10 phút)
GEMINI_FLOOD_TTL_MINUTES=10

# Prompt phân tích ngập lụt (JSON Schema)
GEMINI_FLOOD_PROMPT="Analyze street camera images for flood severity based on real-world reference levels:\nLEVEL_0: Dry road or minor wet patches.\nLEVEL_1: Ankle-deep / curb-level water (<15cm).\nLEVEL_2: Half motorcycle wheel / knee-deep water (15cm-40cm).\nLEVEL_3: Submerged motorcycle wheel / car hood-level water (>40cm).\nUNCLEAR: Blurry, dark, corrupted, or obstructed view.\nReturn concise JSON array matching schema."

# ==========================================
# 2. Cấu hình chu kỳ làm mới & đồng bộ
# ==========================================
# Chu kỳ tự động làm mới ảnh camera trong khung nhìn (tính theo giây)
NEXT_PUBLIC_CAMERA_REFRESH_INTERVAL=30

# Chu kỳ tự động kiểm tra thời tiết Open-Meteo & đồng bộ ngập lụt (tính theo giây)
NEXT_PUBLIC_FLOOD_INTERVAL=60

# Bán kính gom cụm trạm thời tiết Haversine (tùy chỉnh bán kính phù hợp)
# NEXT_PUBLIC_WEATHER_SAMPLE_RADIUS_KM=...

# ==========================================
# 3. Tùy chọn Session Cookie Cổng giao thông
# ==========================================
# CAMERA_COOKIE=".VDMS=...; CurrentLanguage=vi;"
```

---

## 🚀 6. HƯỚNG DẪN CÀI ĐẶT & TRIỂN KHAI

### 1. Cài đặt thư viện dependencies:
```bash
npm install
```

### 2. Chạy môi trường phát triển (Development):
```bash
npm run dev
```
Mở trình duyệt tại: [http://localhost:3000](http://localhost:3000)

### 3. Kiểm tra Build & Chạy Production:
```bash
npm run build
npm run start
```
