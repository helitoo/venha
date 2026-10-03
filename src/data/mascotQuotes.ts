import { MascotMood, MascotType } from "@/types/mascot";

export const MASCOT_IMAGE_MAP: Record<MascotType, Record<MascotMood, string>> = {
  duck: {
    sunny: encodeURI("/mascot/duck/Vịt Nắng.png"),
    rain: encodeURI("/mascot/duck/Vịt Mưa.png"),
    flood: encodeURI("/mascot/duck/Vịt Ngập.png"),
  },
  cat: {
    sunny: encodeURI("/mascot/cat/Mèo Nắng.png"),
    rain: encodeURI("/mascot/cat/Mèo Mưa.png"),
    flood: encodeURI("/mascot/cat/Mèo Ngập.png"),
  },
};

export interface QuoteConfig {
  defaultText: string;
  duckVariant?: string;
  catVariant?: string;
}

export const TIME_BASED_QUOTES: Record<string, QuoteConfig[]> = {
  // Tan tầm 17h00 - 18h30 (Được yêu cầu cụ thể)
  rush_hour_5pm: [
    {
      defaultText: "5h rồi, kiểm tra camera xem đường về ngập không nha!",
      duckVariant: "5h rồi, kiểm tra camera xem đường về ngập không nha! Vịt đợi sen ở nhà nè 🦆🛵",
      catVariant: "5h rồi meow! Check camera xem đường về ngập không nha, meow đói bụng rồi đó 🐱🥘",
    },
    {
      defaultText: "Hết giờ làm rồi! Soi camera các ngã tư trước khi xách xe về nha.",
      duckVariant: "Hết giờ làm rồi! Soi camera xem ngã tư có kẹt xe hay ngập nước không nha 🦆👀",
      catVariant: "Chuông tan ca reo rồi! Về sớm kẻo tắc đường là muộn giờ cho meow ăn nha sen 🐱⏰",
    },
    {
      defaultText: "Giờ tan tầm đông đúc, giữ khoảng cách an toàn và bình tĩnh nhé!",
      duckVariant: "Tan tầm xe cộ như nêm, nhích từng mét thôi đừng chen lấn nha các bác tài 🦆🚦",
      catVariant: "Đường đông nghẹt meow ơi! Bình tĩnh giữ tay lái, an toàn là trên hết nha sen 🐱🚗",
    },
    {
      defaultText: "Kiểm tra xem lộ trình về nhà có đoạn nào đang kẹt cứng không nha.",
      duckVariant: "5h chiều rồi! Bật map lên soi đoạn nào đỏ rực thì quẹo hẻm né gấp nha 🦆🗺️",
      catVariant: "Sen ơi! Đường về có kẹt không đó? Mau về cưng nựng meow đi nè 🐱🐾",
    },
    {
      defaultText: "Tắt máy tính, dọn bàn về nhà thôi nào! Hôm nay bạn đã vất vả rồi ❤️",
      duckVariant: "Xong việc rồi thì về nhà thôi! Một ngày cày cuốc chăm chỉ xứng đáng 100 điểm 🦆💯",
      catVariant: "Meowww! Về nhà ăn bữa cơm ấm áp rồi đánh một giấc thật ngon nào sen 🐱✨",
    },
  ],

  // Sáng đi làm (06:30 - 08:45)
  morning: [
    {
      defaultText: "Chào buổi sáng! Cùng check xem đường đi làm có khô ráo không nhé ☀️",
      duckVariant: "Quác quác! Buổi sáng tràn đầy năng lượng, đường đi làm hôm nay siêu thoáng 🦆✨",
      catVariant: "Meow! Ngủ dậy chưa sen? Check xem lộ trình đi làm hôm nay có mưa ngập không nào 🐱🌤️",
    },
    {
      defaultText: "Nạp năng lượng cho một ngày mới! Nhớ kiểm tra đường trước khi xuất phát nha.",
      duckVariant: "Làm ly cà phê sáng rồi lên đường thôi! Nhớ đội nón bảo hiểm đàng hoàng nha 🦆☕",
      catVariant: "Vươn vai làm một ngày thật năng suất nào! Đừng quên ví và chìa khóa xe nha sen 🐱🔑",
    },
    {
      defaultText: "Đường sáng sớm tương đối thông thoáng, chúc bạn một ngày làm việc suôn sẻ!",
      duckVariant: "Đường sáng nay mát mẻ thích quá! Chạy xe thong thả hít thở không khí trong lành 🦆🍃",
      catVariant: "Chúc sen một ngày làm việc ngập tràn niềm vui và may mắn meow 🐱🍀",
    },
  ],

  // Giờ trưa (11:30 - 13:00)
  noon: [
    {
      defaultText: "Trưa nay ăn gì nè? Nhớ nghỉ ngơi một chút cho lại sức nhé!",
      duckVariant: "Trưa rồi nghỉ tay thôi! Vịt vừa lội nước kiếm cá về no căng bụng nè 🦆🐟",
      catVariant: "Buồn ngủ quá meow... Ăn trưa xong chợp mắt xíu lấy sức chiều làm việc nha sen 🐱💤",
    },
    {
      defaultText: "Giữa trưa nắng gắt, nhớ uống nhiều nước và tránh đứng lâu ngoài trời nha!",
      duckVariant: "Trời trưa nắng nóng, ra đường nhớ mặc áo khoác chống nắng kẻo cháy da nha 🦆🧴",
      catVariant: "Nắng chang chang luôn meow! Kiếm chỗ râm mát ngồi nhâm nhi ly trà đá thôi 🐱🧊",
    },
  ],

  // Chiều muộn (18:30 - 20:30)
  evening: [
    {
      defaultText: "Đường phố đã lên đèn, chúc bạn có một buổi tối thật ấm cúng bên người thân!",
      duckVariant: "Đèn đường sáng rực rồi! Vịt đang nhâm nhi bữa tối, bạn đã về tới nhà chưa 🦆🍲",
      catVariant: "Phố lên đèn là sen lên đồ về nhà! Buổi tối ấm áp bên gia đình nha meow 🐱🛋️",
    },
    {
      defaultText: "Ăn một bữa thật ngon sau ngày dài bận rộn nhé!",
      duckVariant: "Bụng đói cồn cào rồi, về nhà làm tô bún bò nóng hổi thôi bạn ơi 🦆🍜",
      catVariant: "Về nhà xoa bụng meow một cái là tan biến hết mệt mỏi trong ngày liền 🐱❤️",
    },
  ],

  // Tối muộn (sau 21:00)
  night: [
    {
      defaultText: "Về nhà an toàn nhé! Ở nhà luôn có người đang chờ bạn đó ❤️",
      duckVariant: "Khuya rồi, đi chậm thôi nha! Vịt chuẩn bị đi ngủ rồi nè 🦆🌙",
      catVariant: "Đêm muộn rồi sen ơi, về cẩn thận nhé, meow cuộn tròn đợi sen ở cửa nè 🐱🏠",
    },
    {
      defaultText: "Đường vắng ban đêm, hãy chạy đúng tốc độ và chú ý quan sát đèn tín hiệu!",
      duckVariant: "Đêm hôm đường thoáng nhưng chớ chủ quan, quan sát kỹ các ngã tư nha 🦆🚨",
      catVariant: "Meow nhắc sen: Đường khuya sương lạnh, kéo kín khóa áo gió vào nhé 🐱🧥",
    },
  ],
};

export const MOOD_BASED_QUOTES: Record<MascotMood, QuoteConfig[]> = {
  flood: [
    {
      defaultText: "BÁO ĐỘNG NGẬP: Đoạn này nước dâng cao rồi! Quay đầu tìm đường khác gấp nha 🚨",
      duckVariant: "Cứu bé zới! Ngập sâu cỡ này đến Vịt bơi còn muốn chìm, quay đầu né gấp nha bạn ơi 🦆🌊🚨",
      catVariant: "CỨU MEOW VỚI! Ướt sũng hết lông rồi, đừng phi xe vào biển nước này kẻo thành tàu ngầm đó 🐱🚨💦",
    },
    {
      defaultText: "Đường ngập sâu nguy hiểm! Tuyệt đối không cố chạy qua kẻo chết máy xe nhé ⚠️",
      duckVariant: "Nước ngập lút ống xả rồi! Tấp vào lề đợi nước rút làm ly trà sữa rồi hẵng về nha 🦆🧋",
      catVariant: "Ngập nặng quá trời! Sen tay lái yếu thì né đường này ra nghe hông meow 🐱🚫",
    },
    {
      defaultText: "Cảnh báo sóng nước từ xe lớn có thể làm ngã xe máy, hãy di chuyển cẩn thận!",
      duckVariant: "Mấy anh xe buýt chạy qua tạo sóng thần cao nửa mét luôn đó, tấp vào lề ngay 🦆🌊",
      catVariant: "Sóng vỗ dập dồn như đi biển meow! Đừng cố vượt qua kẻo đẩy bộ cả cây số nha 🐱⚠️",
    },
    {
      defaultText: "Nước ngập che khuất ổ gà và nắp cống, hãy đi theo vệt xe phía trước!",
      duckVariant: "Dưới nước không biết có ổ gà nào không, chạy chậm theo xe trước cho chắc ăn 🦆🕳️",
      catVariant: "Né mấy mép đường trũng ra nha sen, nguy hiểm lắm đó meow 🐱👀",
    },
    {
      defaultText: "Nếu xe bị chết máy trong vùng ngập, tuyệt đối không cố đề máy lại!",
      duckVariant: "Xe tắt máy thì dắt lên chỗ khô ráo ngay, đừng đề máy kẻo thủy kích tốn tiền triệu 🦆🔧",
      catVariant: "Đừng ráng nổ máy kẻo cong tay dên meow! Dắt bộ xíu cho xe an toàn nha sen 🐱🛠️",
    },
  ],
  rain: [
    {
      defaultText: "Trời đang đổ mưa! Mặc áo mưa cẩn thận, đi chậm lại kẻo trơn trượt nha 🌧️",
      duckVariant: "Mưa rơi tí tách! Vịt đã mặc sẵn áo mưa và đi ủng rồi, bạn nhớ chạy chậm nha 🦆☔",
      catVariant: "Trời mưa ướt hết cả người rồi meow... Sen nhớ bật đèn xe và giữ tay ga đều nha 🐱🌧️",
    },
    {
      defaultText: "Đường hơi ướt nhẹ, nhớ xi-nhan đàng hoàng nha, ở nhà có người đang đợi đó!",
      duckVariant: "Đường trơn như bôi mỡ, vào cua nhớ rà nhẹ phanh chân kẻo trượt bánh 🦆🛵",
      catVariant: "Mưa gió lạnh lẽo, chạy cẩn thận kẻo tạt nước ướt người đi bên cạnh nha sen 🐱💧",
    },
    {
      defaultText: "Mưa làm giảm tầm nhìn, hãy bật đèn chiếu gần để các phương tiện khác dễ nhận diện!",
      duckVariant: "Kính mũ bảo hiểm dính nước khó nhìn thì lau nhẹ đi nha, quan sát kỹ đường đi 🦆👓",
      catVariant: "Bật đèn xe lên nào sen ơi! Vừa thấy rõ đường vừa an toàn cho mọi người meow 🐱💡",
    },
    {
      defaultText: "Mưa gió hãy tránh đứng dưới các gốc cây cổ thụ to đề phòng gãy cành!",
      duckVariant: "Trời mưa kèm gió to thì né mấy hàng cây cổ thụ với biển quảng cáo lớn ra nha 🦆🌳",
      catVariant: "Gió giật mạnh lắm meow, chạy đều ga và chú ý cành cây rơi nhé 🐱🍃",
    },
  ],
  sunny: [
    {
      defaultText: "Trời quang mây tạnh! Đường khô ráo, lượn về nhà ăn cơm thôi nào 🛵💨",
      duckVariant: "Trời đẹp đường thoáng! Vịt đeo kính râm dạo phố cực ngầu luôn nè 🦆🕶️✨",
      catVariant: "Thời tiết ấm áp tuyệt vời! Bon bon về nhà cuộn tròn với meow thôi nào 🐱☀️",
    },
    {
      defaultText: "Đường thông hè thoáng, về nhà sớm ngủ một giấc lấy sức mai cày tiếp nha!",
      duckVariant: "Bản đồ một màu xanh ngát! Không ngập không kẹt, chuyến đi êm ru như bay 🦆🚀",
      catVariant: "Thời tiết chiều lòng người ghê meow! Đi làm về sớm ghé mua đồ ăn ngon nha sen 🐱🍱",
    },
    {
      defaultText: "Một ngày bình yên, không mưa không ngập. Chúc bạn có chuyến đi thật vui vẻ!",
      duckVariant: "Gió thổi mát rượi, ngắm hoàng hôn buông xuống thành phố chill thật sự 🦆🌅",
      catVariant: "Đường về nhà thẳng tắp không gợn sóng! Thả lỏng vai và tận hưởng hành trình nào 🐱🎶",
    },
    {
      defaultText: "Giao thông tương đối thuận lợi, giữ đúng làn đường và tốc độ an toàn nhé!",
      duckVariant: "Lái xe văn minh, nhường nhịn nhau một tí là đường phố lúc nào cũng vui 🦆🤝",
      catVariant: "Dừng đèn đỏ nhớ đúng vạch nha sen, meow ở nhà đang chấm điểm thanh lịch đó 🐱🚦",
    },
  ],
};

let lastPickedQuote = "";

export function pickDynamicQuote(mascot: MascotType, mood: MascotMood): string {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  let pool: QuoteConfig[] = [];

  // Priority 1: 17h00 - 18h30 Rush hour
  if (hour === 17 || (hour === 18 && minute <= 30)) {
    pool = [...TIME_BASED_QUOTES.rush_hour_5pm];
  } else if (mood === "flood") {
    pool = [...MOOD_BASED_QUOTES.flood];
  } else if (hour >= 6 && hour < 9) {
    pool = [...TIME_BASED_QUOTES.morning];
  } else if (hour >= 11 && hour <= 13) {
    pool = [...TIME_BASED_QUOTES.noon];
  } else if (hour >= 18 && hour < 21) {
    pool = [...TIME_BASED_QUOTES.evening];
  } else if (hour >= 21 || hour < 5) {
    pool = [...TIME_BASED_QUOTES.night];
  }

  // Combine with mood pool to ensure diversity
  const moodList = MOOD_BASED_QUOTES[mood] || MOOD_BASED_QUOTES.sunny;
  pool = [...pool, ...moodList];

  // Filter out the exact last picked quote if possible
  const validPool = pool.filter((item) => {
    const text = mascot === "duck" ? item.duckVariant || item.defaultText : item.catVariant || item.defaultText;
    return text !== lastPickedQuote;
  });

  const finalPool = validPool.length > 0 ? validPool : pool;
  const picked = finalPool[Math.floor(Math.random() * finalPool.length)];

  let result = picked.defaultText;
  if (mascot === "duck" && picked.duckVariant) result = picked.duckVariant;
  if (mascot === "cat" && picked.catVariant) result = picked.catVariant;

  lastPickedQuote = result;
  return result;
}
