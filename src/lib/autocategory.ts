/**
 * Tự xếp danh mục cho sản phẩm chưa có danh mục (vd món nhập từ file CSV Shopee – file không có cột danh mục).
 *
 * Danh mục dùng đúng tên danh mục cấp 1 của Shopee Việt Nam (cùng tên với danh mục tiện ích trình duyệt ghi nhận từ trang sàn),
 * để món tự xếp và món có danh mục từ sàn nằm chung một trang danh mục.
 *
 * Cách đoán: so tên món (bỏ dấu, chữ thường) với bộ từ khoá của từng danh mục; cụm từ dài được tính điểm cao hơn từ đơn
 * ("sữa tắm" thắng "sữa"). Không khớp từ khoá nào thì để AI đoán (nếu có ANTHROPIC_API_KEY), vẫn chỉ được chọn trong danh sách.
 */

export const CATEGORIES = [
  "Thời Trang Nữ",
  "Thời Trang Nam",
  "Thời Trang Trẻ Em",
  "Sắc Đẹp",
  "Sức Khỏe",
  "Mẹ & Bé",
  "Nhà Cửa & Đời Sống",
  "Giặt Giũ & Chăm Sóc Nhà Cửa",
  "Bách Hóa Online",
  "Thiết Bị Điện Gia Dụng",
  "Điện Thoại & Phụ Kiện",
  "Máy Tính & Laptop",
  "Thiết Bị Điện Tử",
  "Máy Ảnh & Máy Quay Phim",
  "Đồng Hồ",
  "Giày Dép Nữ",
  "Giày Dép Nam",
  "Túi Ví Nữ",
  "Balo & Túi Ví Nam",
  "Phụ Kiện & Trang Sức Nữ",
  "Thể Thao & Du Lịch",
  "Ô Tô & Xe Máy & Xe Đạp",
  "Nhà Sách Online",
  "Đồ Chơi",
  "Chăm Sóc Thú Cưng",
  "Dụng Cụ & Thiết Bị Tiện Ích",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Tên danh mục tiếng Anh (Shopee đôi khi trả tiếng Anh) và cách viết khác -> tên chuẩn */
const ALIASES: Record<string, Category> = {
  "women clothes": "Thời Trang Nữ",
  "men clothes": "Thời Trang Nam",
  "kids fashion": "Thời Trang Trẻ Em",
  "beauty": "Sắc Đẹp",
  "health": "Sức Khỏe",
  "mom & baby": "Mẹ & Bé",
  "mom and baby": "Mẹ & Bé",
  "home & living": "Nhà Cửa & Đời Sống",
  "home and living": "Nhà Cửa & Đời Sống",
  "home care": "Giặt Giũ & Chăm Sóc Nhà Cửa",
  "food & beverages": "Bách Hóa Online",
  "groceries": "Bách Hóa Online",
  "home appliances": "Thiết Bị Điện Gia Dụng",
  "mobile & gadgets": "Điện Thoại & Phụ Kiện",
  "computers & accessories": "Máy Tính & Laptop",
  "consumer electronics": "Thiết Bị Điện Tử",
  "cameras & drones": "Máy Ảnh & Máy Quay Phim",
  "watches": "Đồng Hồ",
  "women shoes": "Giày Dép Nữ",
  "men shoes": "Giày Dép Nam",
  "women bags": "Túi Ví Nữ",
  "men bags": "Balo & Túi Ví Nam",
  "fashion accessories": "Phụ Kiện & Trang Sức Nữ",
  "sports & outdoors": "Thể Thao & Du Lịch",
  "automotive": "Ô Tô & Xe Máy & Xe Đạp",
  "books & magazines": "Nhà Sách Online",
  "toys": "Đồ Chơi",
  "pets": "Chăm Sóc Thú Cưng",
  "tools & home improvement": "Dụng Cụ & Thiết Bị Tiện Ích",
};

/** Bỏ dấu, chữ thường, chỉ giữ chữ/số và khoảng trắng */
export function fold(s: string): string {
  return ` ${s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/** Tên danh mục chuẩn (gộp tên tiếng Anh, khác hoa thường); null nếu không phải danh mục đã biết */
export function canonicalCategory(name: string | null | undefined): Category | null {
  if (!name) return null;
  const f = fold(name).trim();
  const hit = CATEGORIES.find((c) => fold(c).trim() === f);
  if (hit) return hit;
  return ALIASES[name.trim().toLowerCase()] ?? null;
}

/** Từ khoá (không dấu) cho từng danh mục. Cụm nhiều chữ được ưu tiên hơn từ đơn. */
const RULES: Record<Category, string[]> = {
  "Thời Trang Nữ": ["dam suong", "dam body", "dam maxi", "dam du tiec", "vay dam", "dam nu", "vay", "chan vay", "ao kieu", "ao croptop", "croptop", "ao 2 day", "ao hai day", "bo do ngu", "do ngu", "quan lot nu", "ao nguc", "ao lot", "bra", "legging nu", "quan ong rong", "ao so mi nu", "jumpsuit", "ao dai", "set vest nu", "bodysuit"],
  "Thời Trang Nam": ["ao so mi nam", "quan tay nam", "quan lot nam", "quan sip nam", "sip nam", "ao thun nam", "quan short nam", "quan au nam", "ao polo", "polo nam", "bo quan ao nam", "quan jean nam", "ao khoac nam"],
  "Thời Trang Trẻ Em": ["be gai", "be trai", "tre em", "quan ao tre em", "dam be", "vay be", "set be", "do bo be", "kiddimi", "legging be"],
  "Sắc Đẹp": ["phan phu", "phan ma", "phan nuoc", "son", "son moi", "kem chong nang", "chong nang", "serum", "toner", "sua rua mat", "tay trang", "nuoc tay trang", "kem duong", "duong da", "duong am", "mat na", "sua tam", "sua duong the", "duong the", "dau goi", "dau xa", "dau goi kho", "nuoc hoa", "kem nen", "cushion", "mascara", "ke mat", "chi ke may", "nail", "nailbox", "nail box", "mong tay gia", "mong gia", "mong up", "mong chan gia", "son gel", "son mong", "tinh chat", "ampoule", "niacinamide", "retinol", "tay te bao chet", "lan khu mui", "xit khu mui", "kem tri mun", "duong moi", "guong cam tay", "mi gia", "uon toc", "may hơ gel", "may ho gel", "may say toc", "lam dep"],
  "Sức Khỏe": ["bao cao su", "durex", "gel boi tron", "vitamin", "thuc pham chuc nang", "vien uong", "khau trang", "nhiet ke", "may do huyet ap", "bang ve sinh", "dung dich ve sinh", "collagen", "omega", "thuoc", "cao dan", "massage", "may massage", "ban chai dien", "tam nuoc", "nuoc suc mieng"],
  "Mẹ & Bé": ["bim ta", "ta bim", "ta giay", "ta dan", "ta quan", "bim quan", "bim dan", "sua bot", "sua cong thuc", "binh sua", "num ti", "growplus", "dielac", "nutifood", "an dam", "xe day", "dịu da", "khan sua", "phan rom", "ghe an dam", "dia chong nong", "sua non", "goby", "gooby", "huggies", "bobby", "merries", "moony", "honey premium", "cho be bu"],
  "Nhà Cửa & Đời Sống": ["goi om", "goi ngu", "goi tua", "vo goi", "chan long", "chan ga goi", "nem cao su", "ke sach", "ke dep", "ke bep", "coc thuy tinh", "chan ga", "ga giuong", "rem cua", "den ngu", "den led", "bong den", "den nang luong mat troi", "den duong", "binh giu nhiet", "coc", "chen bat", "noi", "chao", "dao", "thot", "hop dung", "hop dung thuc pham", "gia treo", "moc treo", "thung rac", "gio dung", "khay", "voi xit", "voi tuoi", "tham", "ngan keo", "ke dung do", "lo hoa", "cay gia", "trang tri", "decor", "guong", "menu", "the menu", "do gia dung", "gia dung", "do bep"],
  "Giặt Giũ & Chăm Sóc Nhà Cửa": ["nuoc giat", "bot giat", "nuoc xa vai", "nuoc rua chen", "nuoc lau san", "tui rac", "tui dung rac", "khan giay", "giay ve sinh", "giay an", "gvs", "chong lau", "cay lau nha", "choi", "choi quet", "choi co", "mieng rua chen", "nuoc tay", "xit con trung", "phat tran", "cay phat tran", "vien tay"],
  "Bách Hóa Online": ["keo deo", "keo mut", "tra sua", "tra xanh", "hu bo", "hat dieu", "banh trang", "rong bien", "muoi", "muoi tieu", "do an vat", "an vat", "snack", "banh", "mi tom", "mi an lien", "ca phe", "nuoc mam", "dau an", "gia vi", "hat dieu", "sua hat", "sua tuoi", "sua chua", "thung sua", "nuoc ngot", "nuoc giai khat", "ngu coc", "kho ga", "kho bo", "dac san", "o food", "ofood", "vinamilk", "th true milk"],
  "Thiết Bị Điện Gia Dụng": ["noi chien", "noi chien khong dau", "noi com dien", "may xay", "may xay sinh to", "am sieu toc", "bep nuong", "bep dien", "bep tu", "may hut bui", "robot hut bui", "quat", "quat mini", "quat tich dien", "quat cam tay", "quat dung", "may loc khong khi", "may suoi", "ban ui", "ban la", "may say", "lo vi song", "lo nuong", "may ep", "may pha ca phe", "may hut am", "may tao am", "may loc nuoc"],
  "Điện Thoại & Phụ Kiện": ["dien thoai", "smartphone", "iphone", "samsung galaxy", "xiaomi poco", "redmi", "oppo", "vivo", "realme", "op lung", "cuong luc", "kinh cuong luc", "mieng dan", "cap sac", "cu sac", "sac nhanh", "sac du phong", "pin du phong", "gia do dien thoai", "tai nghe", "tai nghe bluetooth", "tai nghe khong day", "airpods", "gay chup anh", "the nho"],
  "Máy Tính & Laptop": ["laptop", "macbook", "may tinh", "ban phim", "ban phim co", "chuot", "chuot khong day", "lot chuot", "man hinh", "ssd", "o cung", "ram", "usb", "hub", "webcam", "gia do laptop", "tan nhiet laptop", "router", "bo phat wifi", "card"],
  "Thiết Bị Điện Tử": ["loa", "loa bluetooth", "may chieu", "tivi", "smart tivi", "android box", "tv box", "micro", "dan karaoke", "camera wifi", "camera an ninh", "dong ho thong minh", "smartwatch", "vong deo tay thong minh", "may doc sach", "may tinh bang", "ipad", "tablet"],
  "Máy Ảnh & Máy Quay Phim": ["may anh", "may quay", "flycam", "gopro", "action cam", "ong kinh", "lens", "tripod", "chan may anh", "gimbal"],
  "Đồng Hồ": ["dong ho nam", "dong ho nu", "dong ho deo tay", "dong ho co", "day dong ho"],
  "Giày Dép Nữ": ["giay cao got", "giay nu", "dep nu", "sandal nu", "giay bup be", "guoc"],
  "Giày Dép Nam": ["giay nam", "dep nam", "giay da nam", "sandal nam", "giay tay"],
  "Túi Ví Nữ": ["tui xach", "tui deo cheo nu", "tui nu", "vi nu", "tui cam tay", "tui tote", "tui deo vai"],
  "Balo & Túi Ví Nam": ["balo", "ba lo", "vi nam", "tui deo cheo nam", "tui nam", "vi da nam"],
  "Phụ Kiện & Trang Sức Nữ": ["nhan bac", "mu luoi trai", "mu bucket", "non tai beo", "khuyen tai", "bong tai", "day chuyen", "vong co", "lac tay", "vong tay", "kep toc", "buoc toc", "cai toc", "trang suc", "bac 925", "kinh mat", "kinh thoi trang", "o du", "khan choang", "that lung", "charm"],
  "Thể Thao & Du Lịch": ["ta tap", "bo ta", "vot cau long", "vot", "cau long", "pickleball", "tennis", "bong da", "gang tay thu mon", "ta tay", "ta deo", "day khang luc", "power band", "tham yoga", "yoga", "gym", "xe dap tap", "chan vit", "kinh boi", "do boi", "boi", "can cau", "can cau ca", "may cau", "do cau", "phao cau", "cau ca", "leu", "cam trai", "da ngoai", "ghe xep", "ghe gap", "ung chong nuoc", "den pin", "den doi dau", "dao xep", "victorinox", "binh nuoc the thao", "bida", "co bida", "gay bida", "golf", "vali", "tui du lich"],
  "Ô Tô & Xe Máy & Xe Đạp": ["xe dap", "phu tung xe dap", "gio xe dap", "ghe ngoi truoc xe dap", "mu bao hiem", "non bao hiem", "o to", "xe may", "phu kien o to", "camera hanh trinh", "dau nhot", "rua xe", "gac chan", "khoa xe"],
  "Nhà Sách Online": ["vo o ly", "vo ke ngang", "so tay", "so cong", "but", "but bi", "but gel", "but chi", "sach", "truyen", "van phong pham", "giay a4", "bang keo", "kep giay", "hop but", "lich", "deli", "thien long"],
  "Đồ Chơi": ["do choi", "lego", "xep hinh", "gau bong", "thu bong", "bup be", "mo hinh", "o to do choi", "rubik", "slime", "dat nan", "board game", "xe dieu khien"],
  "Chăm Sóc Thú Cưng": ["cho meo", "thuc an cho meo", "thuc an cho cho", "pate", "cat ve sinh", "cat meo", "vong co cho", "do choi cho meo", "thu cung", "pet"],
  "Dụng Cụ & Thiết Bị Tiện Ích": ["may khoan", "khoan", "tua vit", "co le", "kim cat", "kim cat mong", "bo dung cu", "dung cu sua chua", "may han", "thuoc do", "bang dinh", "velcro", "day dan", "o cam", "phich cam", "o dien", "cong tac", "khoa cua", "khoa van tay", "may bom", "kim bam"],
};

// Tiền xử lý: chuỗi từ khoá đã bỏ dấu (vài từ ở trên lỡ có dấu) + trọng số theo số chữ
const COMPILED = (Object.entries(RULES) as [Category, string[]][]).map(([cat, kws]) => ({
  cat,
  kws: [...new Set(kws.map((k) => fold(k)))].map((k) => ({ k, w: k.trim().split(" ").length ** 2 })),
}));

/** Đoán danh mục theo từ khoá; null khi không khớp từ nào. score càng cao càng chắc. */
export function guessCategory(name: string): { category: Category; score: number; runnerUp: number } | null {
  const f = fold(name);
  const scores = COMPILED.map(({ cat, kws }) => {
    let s = 0;
    for (const { k, w } of kws) if (f.includes(k)) s += w;
    return { cat, s };
  })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || CATEGORIES.indexOf(a.cat) - CATEGORIES.indexOf(b.cat));
  if (!scores.length) return null;
  return { category: scores[0].cat, score: scores[0].s, runnerUp: scores[1]?.s ?? 0 };
}

/** Kết quả đoán đủ chắc để tự gán (không mơ hồ giữa 2 danh mục) */
export function confident(g: { score: number; runnerUp: number } | null): boolean {
  return !!g && g.score > g.runnerUp && (g.score >= 4 || g.score >= g.runnerUp * 1.5);
}
