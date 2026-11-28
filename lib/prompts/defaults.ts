/**
 * Prompt mặc định. Không import gì để dùng được cả trong web lẫn script seed.
 *
 * Mô hình sản phẩm của xưởng: tấm MỎNG, PHẲNG làm từ chất liệu (decal) của xưởng theo hình logo của khách. Ảnh tham chiếu của
 * mỗi chất liệu do hệ thống ghép từ lớp 1 / mặt trước (bên TRÁI) và lớp 2 / mặt sau (bên PHẢI).
 *
 * Phần khung ở đây cố ý TRUNG TÍNH về kiểu hàng (D113): hàng khắc hay cắt, tấm ôm sát logo hay giữ hình huy hiệu đều do
 * hệ thống chèn vào {{materials_list}} (catalog) hoặc {{material_finish}} (thiết kế), lấy từ công nghệ của chất liệu và ô
 * "logo dạng huy hiệu" của logo (xem lib/prompts/finish.ts, lib/prompts/render.ts). Khung chỉ nói những điều đúng cho mọi kiểu:
 * - logo chỉ lấy HÌNH, không bao giờ lấy màu / nền / phối cảnh của ảnh logo (D108: từng bị lọt màu logo mẫu vào ảnh);
 * - chất liệu chỉ lấy vân / màu / độ bóng và phải giữ đúng (D110: chất liệu giả gương từng bị vẽ xỉn);
 * - tấm mỏng phẳng, chụp thẳng từ trên xuống (D59);
 * - cấm tráo, trộn chất liệu giữa các ô (D105, D112).
 *
 * Phần tả "tấm mỏng phẳng" (FLAT_LOOK) và vẻ khắc laser (ENGRAVE_LOOK ở finish.ts) giữ đúng câu chữ đầy đủ của phiên 13:27
 * ngày 25/11/2026 (D114): bản rút quá gọn ở D113 làm hàng khắc ra dày, nổi khối. D134 (28/11/2026) chỉ THÊM vào đó, không
 * bớt câu nào: chủ xưởng báo ảnh vẫn dày hơn hàng thật, nên ghi độ dày thật của decal (0,3-0,5 mm thay cho "0,2-3 mm"),
 * cấm vẻ "tấm bảng kim loại" và mép vát, dặn viền trang trí của logo (dây thừng, gạch chéo) là nét phẳng, và bỏ lại độ nổi
 * khi ảnh logo là ảnh chụp một mẫu nổi khối. Bài học khi thử với AI thật: tả bóng và nền bằng điều MUỐN CÓ ("mặt nền sáng đều
 * tới sát mép tấm"); bản nháp liệt kê thứ phải tránh ("no drop shadow, no dark halo") làm AI vẽ nền đen có quầng sáng.
 * Vẫn giữ nguyên tắc mỗi kiểu hàng chỉ định
 * nghĩa MỘT lần, nên prompt catalog 10 ô chỉ khoảng 6.500-7.700 ký tự, thừa xa giới hạn 20.000 của GPT Image 2.5 Sunburst (model
 * duy nhất đang cho chọn). Lưu ý nếu bật lại Seedream / MiniMax / Qwen (giới hạn 5.000 ký tự, lib/providers/kie-models.ts)
 * thì prompt này dài hơn mức các model đó nhận. Có test kiểm tra độ dài ở lib/prompts/defaults.test.ts.
 */
const LOGO_REF = `Reference image 1 is the customer's logo (a clean graphic, or a photo of a physical sample). Use only its shapes: reproduce the symbol, letterforms, proportions and spacing exactly, without redrawing, restyling, adding or replacing anything. Never copy its colours, its plain background or the surface it lies on, its perspective or its lighting. If it shows a raised, embossed or cast sample, leave that thickness and relief behind as well and take its outlines only.`;

const FLAT_LOOK = `Look and realism (very important): every piece is THIN and FLAT: a flexible decal film only about 0.3-0.5 mm thick, as thin as a vinyl sticker or a sheet of card, like a die-cut sticker, decal or thin plastic or fabric patch lying flat. It is never a rigid plate, plaque, metal nameplate, coin or moulded emblem, even when the material is mirror-like or metallic (that is a thin metallised film, not a piece of metal). It must look like a real photographed product, NOT a 3D render:
- Shot perfectly top-down (flat lay, orthographic, no perspective, no tilt, no depth of field blur).
- Every face is completely flat. The pattern, colour and texture lie flat in the surface and run continuously across the letters and symbol. No extrusion, no bevel, no rounded or puffy letters, no raised or chunky 3D lettering, no visible side walls, no inner or outer glow, no strong 3D highlights or reflections (only the material's own natural sheen, e.g. flat metallic foil or mirror gloss where the material is glossy).
- The piece shows no thickness: seen from above, its outer edge is a single crisp cut line where the material simply ends, without a chamfer, a rim or a raised lip.
- Engraved areas sit only a hair below the top surface (about a tenth of a millimetre): they read as a change of colour and finish, not as grooves with depth. Any border is thin, even and flat. Lines, hatching, rope or beaded borders and other ornaments of the logo are flat line art in the surface, never raised ridges or embossing. Cut edges are hairlines, not thick walls.
- Lighting is even, soft and diffused from above. The piece lies in full contact with the surface beneath it, like a sticker pressed flat onto it: that surface stays evenly lit right up to the edge of the piece, with at most a very small, tight, faint contact shadow.`;

export const DEFAULT_CATALOG_PROMPT = `Create one product-sample sheet as a strict grid of {{cols}} columns and {{rows}} rows, equal cells, thin white gutters, plain white background.

Each cell shows ONE finished logo piece photographed top-down: a thin flat piece made from that cell's material, in one of the product types defined below. Never show the logo printed on a tag, card or keychain; never add holes, rings or extra frames.

${LOGO_REF}

Reference images 2 onward are material samples from our workshop, one per cell, each a two-panel photo: LEFT panel = FRONT material, RIGHT panel = BACK material. Take only texture, colour, pattern and gloss from the panels and reproduce them faithfully (a mirror material stays mirror-bright, glitter stays glittery, fabric keeps its weave). Never copy the shape, holes, labels, rulers, tables or backgrounds visible in the sample photos.

{{materials_list}}

${FLAT_LOOK}

Rules:
- Same logo, same size, same camera and lighting in every cell; the piece is centred with a generous margin on a clean light-grey cell background.
- Keep the pattern scale realistic and consistent with the sample.
- Each cell's type, texture, colour and pattern come ONLY from its own line above. Never swap or blend cells: take extra care with cells next to each other in the grid or in reading order, and with materials that look alike (e.g. two shiny, mirror-like or glittery ones). Before finishing, check every cell against its line.
- Do not write any text, numbers or captions in the image. The logo's own letters are the only text.`;

export const DEFAULT_DESIGN_PROMPT = `Create one realistic product photo of: {{product_type}}. The customer's logo appears on it as a thin flat logo piece made in our workshop, attached to the product in a natural way.

${LOGO_REF}

Reference image 2 is a two-panel material photo from our workshop: LEFT panel = FRONT material, RIGHT panel = BACK material. Take only texture, colour, pattern and gloss from the panels and reproduce them faithfully. Never copy the shape, holes, labels, rulers, tables or backgrounds visible in the sample photo.

How the logo piece is made (fixed by our workshop from the material's production technique, follow it exactly): {{material_finish}}

${FLAT_LOOK}
On the product, the logo piece follows the same rule: a thin flat piece lying on the product surface, never a chunky 3D object.

Design style: {{design_style}}
Extra notes from the sales team: {{note}}

Do not write any text, numbers or captions in the image. The logo's own letters are the only text.`;
