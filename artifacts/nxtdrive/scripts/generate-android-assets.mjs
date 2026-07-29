import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

const projectRoot = new URL("..", import.meta.url).pathname;
const androidResources = join(projectRoot, "android/app/src/main/res");
const iconSource = join(projectRoot, "public/icons/instructor-512.png");
const playStoreRoot = join(projectRoot, "android/play-store/graphics");
const densitySizes = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

for (const [density, size] of Object.entries(densitySizes)) {
  const directory = join(androidResources, `mipmap-${density}`);
  await mkdir(directory, { recursive: true });
  const icon = await sharp(iconSource)
    .resize(size, size, { fit: "cover" })
    .png()
    .toBuffer();
  const foregroundSize = Math.round(size * 0.72);
  const foreground = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await sharp(iconSource)
          .resize(foregroundSize, foregroundSize, { fit: "cover" })
          .png()
          .toBuffer(),
        gravity: "center",
      },
    ])
    .png()
    .toBuffer();
  const circleMask = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
  await Promise.all([
    sharp(icon).toFile(join(directory, "ic_launcher.png")),
    sharp(icon)
      .composite([{ input: circleMask, blend: "dest-in" }])
      .png()
      .toFile(join(directory, "ic_launcher_round.png")),
    sharp(foreground).toFile(join(directory, "ic_launcher_foreground.png")),
  ]);
}

await mkdir(join(playStoreRoot, "icon"), { recursive: true });
await sharp(iconSource)
  .resize(512, 512, { fit: "cover" })
  .png()
  .toFile(join(playStoreRoot, "icon", "icon-512.png"));

const featureMark = await sharp(iconSource)
  .resize(260, 260, { fit: "contain" })
  .png()
  .toBuffer();
const featureText = Buffer.from(`
  <svg width="1024" height="500" xmlns="http://www.w3.org/2000/svg">
    <text x="370" y="225" fill="#ffffff" font-family="Arial, sans-serif"
      font-size="64" font-weight="700">NXTDRIVE</text>
    <text x="373" y="292" fill="#cbd5e1" font-family="Arial, sans-serif"
      font-size="38">Instructeur</text>
  </svg>
`);
await mkdir(join(playStoreRoot, "feature-graphic"), { recursive: true });
await sharp({
  create: {
    width: 1024,
    height: 500,
    channels: 4,
    background: "#0f172a",
  },
})
  .composite([
    { input: featureMark, left: 70, top: 120 },
    { input: featureText, left: 0, top: 0 },
  ])
  .png()
  .toFile(
    join(playStoreRoot, "feature-graphic", "feature-graphic-1024x500.png"),
  );
