/**
 * Prompt mặc định. Không import gì để dùng được cả trong web lẫn script seed.
 *
 * Mô hình sản phẩm của xưởng: logo của khách được cắt rời theo đúng hình dạng logo (die-cut),
 * MẶT TRƯỚC làm bằng chất liệu "lớp 1", VIỀN và cạnh dày làm bằng chất liệu "lớp 2" (mặt sau).
 * Ảnh tham chiếu của mỗi chất liệu do hệ thống ghép từ lớp 1 (bên TRÁI) và lớp 2 (bên PHẢI).
 */
export const DEFAULT_CATALOG_PROMPT = `Create one product-sample sheet as a strict grid of {{cols}} columns and {{rows}} rows, equal cells, thin white gutters, plain white background.

What each cell shows: ONE finished logo piece, photographed straight-on. The piece is a die-cut copy of the customer's logo: its outer outline IS the silhouette of the logo (symbol and letters kept exactly as in the logo, with the same spacing). It is NOT a logo printed or engraved on a rectangular tag, plate, card or keychain. Do not add any backing shape, hole, ring or frame.

Reference image 1 is the customer's logo. It may be white or light-coloured on a transparent background: use its shape. Reproduce its shapes, proportions and letterforms exactly. Do not redraw, restyle, add or remove anything.

Reference images 2 onward are material samples from our workshop. Each one is a two-panel photo:
- LEFT panel = FRONT material. The front (top) face of the logo piece is made of this material.
- RIGHT panel = BACK material. The border and the edge of the logo piece are made of this material: a clearly visible rim, roughly 2-3% of the overall logo width, running all around the outline of every part of the logo, which also forms the visible thickness at the edges.
Take only texture, colour, pattern, gloss and thickness from the panels. Never copy the shape, holes, labels, rulers, tables or backgrounds visible in the sample photos.

Cells, in reading order (left to right, top to bottom):
{{materials_list}}

Rules:
- Same logo, same size, same straight-on camera and the same soft studio lighting in every cell. The logo piece is centred with a generous margin on a clean light-grey cell background, with a soft contact shadow.
- The front face and the border must be visibly different materials, exactly like the left and right panels of that cell's reference image.
- Keep the pattern scale realistic and consistent with the sample.
- Do not mix materials between cells.
- Do not write any text, numbers or captions in the image. The logo's own letters are the only text.`;

export const DEFAULT_DESIGN_PROMPT = `Create one realistic product photo of: {{product_type}}. The customer's logo appears on it as a die-cut logo piece (its outline follows the logo's silhouette exactly), attached to the product in a natural way.

Reference image 1 is the customer's logo. It may be white or light-coloured on a transparent background: use its shape. Reproduce its shapes, proportions and letterforms exactly. Do not redraw, restyle, add or remove anything.

Reference image 2 is a two-panel material photo from our workshop:
- LEFT panel = FRONT material. The front (top) face of the logo piece is made of this material.
- RIGHT panel = BACK material. The border and the edge of the logo piece are made of this material: a clearly visible rim running all around the outline, which also forms the visible thickness at the edges.
Take only texture, colour, pattern, gloss and thickness from the panels. Never copy the shape, holes, labels, rulers, tables or backgrounds visible in the sample photo.

Design style: {{design_style}}
Extra notes from the sales team: {{note}}

The front face and the border must be visibly different materials. Do not write any text, numbers or captions in the image. The logo's own letters are the only text.`;
