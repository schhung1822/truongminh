/**
 * Prompt mặc định. Không import gì để dùng được cả trong web lẫn script seed.
 *
 * Mô hình sản phẩm của xưởng: logo của khách được cắt rời theo đúng hình dạng logo (die-cut),
 * MẶT TRƯỚC làm bằng chất liệu "lớp 1", VIỀN và cạnh dày làm bằng chất liệu "lớp 2" (mặt sau).
 * Ảnh tham chiếu của mỗi chất liệu do hệ thống ghép từ lớp 1 (bên TRÁI) và lớp 2 (bên PHẢI).
 *
 * Sản phẩm thật là tấm MỎNG, PHẲNG (in UV, khắc laser, decal), không phải chữ nổi khối. Phần FLAT_LOOK dặn AI
 * chụp thẳng từ trên xuống, bề mặt phẳng, cạnh chỉ là đường mảnh, để ảnh ra giống hàng in/khắc thật, không bị "3D".
 */
const FLAT_LOOK = `Look and realism (very important): this is a THIN, FLAT printed / laser-engraved cut-out, only 1-3 mm thick, like a die-cut sticker, decal or thin plastic or fabric patch lying flat. It must look like a real photographed print or engraving, NOT a 3D render:
- Shot perfectly top-down (flat lay, orthographic, no perspective, no tilt, no depth of field blur).
- The front face is completely flat. The pattern, colour and texture are printed or engraved INTO the flat surface and run continuously across the letters and symbol. No extrusion, no bevel, no rounded or puffy letters, no raised or chunky 3D lettering, no visible side walls, no inner or outer glow, no strong 3D highlights or reflections (only the material's own natural sheen, e.g. flat metallic foil or mirror gloss where the material is glossy).
- The back material shows only as a thin, even, flat border around the outline, like an offset sticker border. The cut edge is a hairline, not a thick wall.
- Lighting is even, soft and diffused from above. The only shadow is a very small, tight, faint contact shadow, like a thin sheet resting on the surface.`;
export const DEFAULT_CATALOG_PROMPT = `Create one product-sample sheet as a strict grid of {{cols}} columns and {{rows}} rows, equal cells, thin white gutters, plain white background.

What each cell shows: ONE finished logo piece (a thin flat cut-out), photographed top-down. The piece is a die-cut copy of the customer's logo: its outer outline IS the silhouette of the logo (symbol and letters kept exactly as in the logo, with the same spacing). It is NOT a logo printed or engraved on a rectangular tag, plate, card or keychain. Do not add any backing shape, hole, ring or frame.

Reference image 1 is the customer's logo, shown on a plain flat background (white or dark). The background is NOT part of the logo: ignore it and use only the logo's shapes, symbol and letters. Reproduce its shapes, proportions and letterforms exactly. Do not redraw, restyle, add or remove anything, and do not invent or replace any letters.

Reference images 2 onward are material samples from our workshop. Each one is a two-panel photo:
- LEFT panel = FRONT material. The front (top) face of the logo piece is made of this material.
- RIGHT panel = BACK material. The border and the edge of the logo piece are made of this material: a clearly visible flat rim, roughly 2-3% of the overall logo width, running evenly all around the outline of every part of the logo.
Take only texture, colour, pattern and gloss from the panels. Never copy the shape, holes, labels, rulers, tables or backgrounds visible in the sample photos.

Cells, in reading order (left to right, top to bottom):
{{materials_list}}

${FLAT_LOOK}

Rules:
- Same logo, same size, same top-down camera and the same even, soft lighting in every cell. The logo piece is centred with a generous margin on a clean light-grey cell background, with only a very faint tight contact shadow.
- The front face and the border must be visibly different materials, exactly like the left and right panels of that cell's reference image.
- Keep the pattern scale realistic and consistent with the sample.
- Do not mix materials between cells.
- Do not write any text, numbers or captions in the image. The logo's own letters are the only text.`;

export const DEFAULT_DESIGN_PROMPT = `Create one realistic product photo of: {{product_type}}. The customer's logo appears on it as a die-cut logo piece (its outline follows the logo's silhouette exactly), attached to the product in a natural way.

Reference image 1 is the customer's logo, shown on a plain flat background (white or dark). The background is NOT part of the logo: ignore it and use only the logo's shapes, symbol and letters. Reproduce its shapes, proportions and letterforms exactly. Do not redraw, restyle, add or remove anything, and do not invent or replace any letters.

Reference image 2 is a two-panel material photo from our workshop:
- LEFT panel = FRONT material. The front (top) face of the logo piece is made of this material.
- RIGHT panel = BACK material. The border and the edge of the logo piece are made of this material: a clearly visible flat rim running evenly all around the outline.
Take only texture, colour, pattern and gloss from the panels. Never copy the shape, holes, labels, rulers, tables or backgrounds visible in the sample photo.

${FLAT_LOOK}
On the product, the logo piece follows the same rule: it is a thin flat applied cut-out (printed, engraved or stitched-on look) lying on the product surface, never a chunky 3D object.

Design style: {{design_style}}
Extra notes from the sales team: {{note}}

The front face and the border must be visibly different materials. Do not write any text, numbers or captions in the image. The logo's own letters are the only text.`;
