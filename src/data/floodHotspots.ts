export interface FloodHotspot {
  id: string;
  street: string;
  district: string;
  cause: "tide" | "rain" | "both";
  causeLabel: string;
  severity: "Cao" | "Trung bình";
  description: string;
  keywords: string[];
}

export const FREQUENT_FLOOD_HOTSPOTS: FloodHotspot[] = [
  // Quận 7
  {
    id: "q7-tran-xuan-soan",
    street: "Trần Xuân Soạn",
    district: "Quận 7",
    cause: "both",
    causeLabel: "Triều cường & Mưa lớn",
    severity: "Cao",
    description: "Tuyến đường ven Kênh Tẻ, ngập sâu 30-60cm vào các đợt đỉnh triều rằm và mùng 1 âm lịch.",
    keywords: ["trần xuân soạn", "tran xuan soan", "kênh tẻ", "kenh te"],
  },
  {
    id: "q7-huynh-tan-phat",
    street: "Huỳnh Tấn Phát",
    district: "Quận 7",
    cause: "both",
    causeLabel: "Triều cường & Mưa lớn",
    severity: "Cao",
    description: "Đoạn từ cầu Phú Xuân đến giao lộ Nguyễn Thị Thập trũng thấp, thoát nước chậm.",
    keywords: ["huỳnh tấn phát", "huynh tan phat"],
  },
  {
    id: "q7-le-van-luong",
    street: "Lê Văn Lương",
    district: "Quận 7",
    cause: "tide",
    causeLabel: "Triều cường",
    severity: "Cao",
    description: "Các đoạn trũng qua các cây cầu sắt cũ thường ngập tràn lòng đường khi triều dâng.",
    keywords: ["lê văn lương", "le van luong"],
  },
  {
    id: "q7-nguyen-thi-thap",
    street: "Nguyễn Thị Thập",
    district: "Quận 7",
    cause: "rain",
    causeLabel: "Mưa lớn",
    severity: "Trung bình",
    description: "Đoạn trũng gần nút giao Huỳnh Tấn Phát và Nguyễn Văn Linh ngập cục bộ sau mưa.",
    keywords: ["nguyễn thị thập", "nguyen thi thap"],
  },

  // Quận 8
  {
    id: "q8-ben-phu-dinh",
    street: "Bến Phú Định",
    district: "Quận 8",
    cause: "tide",
    causeLabel: "Triều cường",
    severity: "Cao",
    description: "Dọc sông Chợ Đệm, nước triều tràn bờ gây ngập kéo dài nhiều giờ liền.",
    keywords: ["phú định", "phu dinh", "bến phú định"],
  },
  {
    id: "q8-pham-the-hien",
    street: "Phạm Thế Hiển",
    district: "Quận 8",
    cause: "both",
    causeLabel: "Triều cường & Mưa lớn",
    severity: "Cao",
    description: "Đoạn gần cầu Bà Tàng, cầu Hiệp Ân nước tràn vào nhà dân khi triều vượt báo động II.",
    keywords: ["phạm thế hiển", "pham the hien"],
  },
  {
    id: "q8-an-duong-vuong",
    street: "An Dương Vương",
    district: "Quận 8",
    cause: "both",
    causeLabel: "Triều cường & Mưa lớn",
    severity: "Trung bình",
    description: "Khu vực giáp ranh Bình Tân, trũng thấp thoát nước ra Kênh Đôi chậm.",
    keywords: ["an dương vương", "an duong vuong"],
  },

  // Bình Thạnh
  {
    id: "bt-binh-quoi",
    street: "Bình Quới (Thanh Đa)",
    district: "Bình Thạnh",
    cause: "tide",
    causeLabel: "Triều cường",
    severity: "Cao",
    description: "Bán đảo Thanh Đa địa hình trũng thấp bao quanh bởi sông Sài Gòn, triều lên ngập sâu.",
    keywords: ["bình quới", "binh quoi", "thanh đa", "thanh da"],
  },
  {
    id: "bt-ung-van-khiem",
    street: "Ung Văn Khiêm",
    district: "Bình Thạnh",
    cause: "both",
    causeLabel: "Triều cường & Mưa lớn",
    severity: "Cao",
    description: "Đoạn giao ngã tư Nguyễn Gia Trí và chân cầu Sài Gòn, nước thoát ra sông Sài Gòn bị chặn.",
    keywords: ["ung văn khiêm", "ung van khiem"],
  },
  {
    id: "bt-nguyen-gia-tri",
    street: "Nguyễn Gia Trí (D2)",
    district: "Bình Thạnh",
    cause: "rain",
    causeLabel: "Mưa lớn",
    severity: "Cao",
    description: "Mặt đường trũng giữa tuyến, mưa rào trên 30 phút là ngập nửa bánh xe máy.",
    keywords: ["nguyễn gia trí", "nguyen gia tri", "đường d2", "d2"],
  },
  {
    id: "bt-dinh-bo-linh",
    street: "Đinh Bộ Lĩnh",
    district: "Bình Thạnh",
    cause: "rain",
    causeLabel: "Mưa lớn",
    severity: "Cao",
    description: "Đoạn từ cầu Bình Triệu tới đường Bạch Đằng, ngập kết hợp ùn ứ xe cộ nghiêm trọng.",
    keywords: ["đinh bộ lĩnh", "dinh bo linh"],
  },
  {
    id: "bt-nguyen-huu-canh",
    street: "Nguyễn Hữu Cảnh",
    district: "Bình Thạnh",
    cause: "both",
    causeLabel: "Triều cường & Mưa lớn",
    severity: "Trung bình",
    description: "Khu vực dạ cầu Thủ Thiêm và Thạnh Mỹ Tây trũng thấp khi mưa kết hợp triều dâng.",
    keywords: ["nguyễn hữu cảnh", "nguyen huu canh"],
  },

  // TP. Thủ Đức
  {
    id: "td-quoc-huong",
    street: "Quốc Hương (Thảo Điền)",
    district: "TP. Thủ Đức",
    cause: "both",
    causeLabel: "Triều cường & Mưa lớn",
    severity: "Cao",
    description: "Điểm ngập sâu kinh niên của Thảo Điền, ngập 30-50cm làm chết máy hàng loạt xe.",
    keywords: ["quốc hương", "quoc huong", "thảo điền", "thao dien"],
  },
  {
    id: "td-nguyen-van-huong",
    street: "Nguyễn Văn Hưởng",
    district: "TP. Thủ Đức",
    cause: "tide",
    causeLabel: "Triều cường",
    severity: "Cao",
    description: "Nằm sát bờ sông Sài Gòn, thường xuyên ngập lênh láng mỗi khi triều cường dâng cao.",
    keywords: ["nguyễn văn hưởng", "nguyen van huong"],
  },
  {
    id: "td-to-ngoc-van",
    street: "Tô Ngọc Vân",
    district: "TP. Thủ Đức",
    cause: "rain",
    causeLabel: "Mưa lớn",
    severity: "Cao",
    description: "Khu vực giao cắt đường sắt Linh Đông tạo thành trũng nước chảy xiết nguy hiểm.",
    keywords: ["tô ngọc vân", "to ngoc van"],
  },
  {
    id: "td-vo-van-ngan",
    street: "Võ Văn Ngân (Chợ Thủ Đức)",
    district: "TP. Thủ Đức",
    cause: "rain",
    causeLabel: "Mưa lớn",
    severity: "Cao",
    description: "Dốc dồn nước từ đồi xuống lòng chảo Chợ Thủ Đức, nước chảy như thác cuốn trôi xe.",
    keywords: ["võ văn ngân", "vo van ngan", "chợ thủ đức", "cho thu duc"],
  },
  {
    id: "td-kha-van-can",
    street: "Kha Vạn Cân",
    district: "TP. Thủ Đức",
    cause: "rain",
    causeLabel: "Mưa lớn",
    severity: "Trung bình",
    description: "Đoạn chân cầu Gò Dưa và rạch Bình Triệu nước ứ đọng do cống thoát nhỏ.",
    keywords: ["kha vạn cân", "kha van can"],
  },
  {
    id: "td-luong-dinh-cua",
    street: "Lương Định Của",
    district: "TP. Thủ Đức",
    cause: "both",
    causeLabel: "Triều cường & Mưa lớn",
    severity: "Cao",
    description: "Đoạn gần nút giao Trần Não và Mai Chí Thọ trũng lầy lội khi mưa hoặc triều cường.",
    keywords: ["lương định của", "luong dinh cua"],
  },
  {
    id: "td-nguyen-duy-trinh",
    street: "Nguyễn Duy Trinh",
    district: "TP. Thủ Đức",
    cause: "rain",
    causeLabel: "Mưa lớn",
    severity: "Trung bình",
    description: "Đoạn qua phường Bình Trưng Tây và Phú Hữu mặt đường hẹp, ngập bánh xe.",
    keywords: ["nguyễn duy trinh", "nguyen duy trinh"],
  },

  // Quận Bình Tân
  {
    id: "btan-ho-hoc-lam",
    street: "Hồ Học Lãm",
    district: "Bình Tân",
    cause: "both",
    causeLabel: "Triều cường & Mưa lớn",
    severity: "Cao",
    description: "Tuyến đường trũng dài giao Võ Văn Kiệt và Quốc lộ 1, ngập sâu dai dẳng.",
    keywords: ["hồ học lãm", "ho hoc lam"],
  },
  {
    id: "btan-phan-anh",
    street: "Phan Anh",
    district: "Bình Tân",
    cause: "rain",
    causeLabel: "Mưa lớn",
    severity: "Cao",
    description: "Giáp ranh Tân Phú, trũng thấp hứng toàn bộ lưu lượng nước từ các phường xung quanh.",
    keywords: ["phan anh"],
  },
  {
    id: "btan-kinh-duong-vuong",
    street: "Kinh Dương Vương",
    district: "Bình Tân",
    cause: "both",
    causeLabel: "Triều cường & Mưa lớn",
    severity: "Trung bình",
    description: "Đoạn trũng gần Mũi Tàu và Bến xe Miền Tây khi mưa to kết hợp triều dâng.",
    keywords: ["kinh dương vương", "kinh duong vuong"],
  },

  // Quận Gò Vấp
  {
    id: "gv-phan-huy-ich",
    street: "Phan Huy Ích",
    district: "Gò Vấp",
    cause: "rain",
    causeLabel: "Mưa lớn",
    severity: "Cao",
    description: "Điểm trũng giáp Kênh Tham Lương, mưa lớn nước dâng lên tới yên xe máy.",
    keywords: ["phan huy ích", "phan huy ich"],
  },
  {
    id: "gv-le-duc-tho",
    street: "Lê Đức Thọ",
    district: "Gò Vấp",
    cause: "rain",
    causeLabel: "Mưa lớn",
    severity: "Cao",
    description: "Đoạn cầu Cụt và giao Nguyễn Văn Lượng mặt đường trũng sâu.",
    keywords: ["lê đức thọ", "le duc tho"],
  },
  {
    id: "gv-nguyen-van-khoi",
    street: "Nguyễn Văn Khối (Cây Trâm)",
    district: "Gò Vấp",
    cause: "rain",
    causeLabel: "Mưa lớn",
    severity: "Cao",
    description: "Đoạn trũng gần công viên Làng Hoa, nước ngập lút bánh xe sau mưa rào.",
    keywords: ["nguyễn văn khối", "nguyen van khoi", "cây trâm", "cay tram"],
  },
  {
    id: "gv-pham-van-chieu",
    street: "Phạm Văn Chiêu",
    district: "Gò Vấp",
    cause: "rain",
    causeLabel: "Mưa lớn",
    severity: "Trung bình",
    description: "Đoạn từ Lê Văn Thọ đến Quang Trung thoát nước kém.",
    keywords: ["phạm văn chiêu", "pham van chieu"],
  },

  // Quận 4
  {
    id: "q4-doan-van-bo",
    street: "Đoàn Văn Bơ",
    district: "Quận 4",
    cause: "tide",
    causeLabel: "Triều cường",
    severity: "Cao",
    description: "Đoạn từ Hoàng Diệu đến Bến Vân Đồn chịu áp lực triều dâng từ rạch Bến Nghé.",
    keywords: ["đoàn văn bơ", "doan van bo"],
  },
  {
    id: "q4-ton-that-thuyet",
    street: "Tôn Thất Thuyết",
    district: "Quận 4",
    cause: "tide",
    causeLabel: "Triều cường",
    severity: "Cao",
    description: "Ven Kênh Tẻ, khi triều cường đỉnh điểm nước tràn trực tiếp qua mép kè đường.",
    keywords: ["tôn thất thuyết", "ton that thuyet"],
  },

  // Huyện Nhà Bè
  {
    id: "nb-le-van-luong",
    street: "Lê Văn Lương (Nhà Bè)",
    district: "Nhà Bè",
    cause: "tide",
    causeLabel: "Triều cường",
    severity: "Cao",
    description: "Các đoạn qua cầu Rạch Đỉa, Rạch Tôm, Rạch Dơi ngập sâu chia cắt lưu thông.",
    keywords: ["lê văn lương", "le van luong", "nhà bè", "rạch tôm"],
  },

  // Quận 12
  {
    id: "q12-nguyen-van-qua",
    street: "Nguyễn Văn Quá",
    district: "Quận 12",
    cause: "rain",
    causeLabel: "Mưa lớn",
    severity: "Cao",
    description: "Khu vực trũng ngập sâu nổi tiếng quanh Chợ Cầu và kênh Tham Lương.",
    keywords: ["nguyễn văn quá", "nguyen van qua"],
  },
];

/**
 * Check if a camera is located on or near a known frequent flood street.
 */
export function isFrequentFloodCamera(cam: { CamName?: string; District?: string }): boolean {
  if (!cam.CamName) return false;
  const nameNorm = cam.CamName.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  for (const hotspot of FREQUENT_FLOOD_HOTSPOTS) {
    for (const kw of hotspot.keywords) {
      const kwNorm = kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (nameNorm.includes(kwNorm)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Find the matching hotspot for a camera name, if any.
 */
export function getMatchingHotspot(camName: string): FloodHotspot | undefined {
  const nameNorm = camName.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return FREQUENT_FLOOD_HOTSPOTS.find((h) =>
    h.keywords.some((kw) => {
      const kwNorm = kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return nameNorm.includes(kwNorm);
    })
  );
}
