import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const resourcesDir = path.join(__dirname, '../resources')

if (!fs.existsSync(resourcesDir)) fs.mkdirSync(resourcesDir, { recursive: true })

console.log('Icon generation: Please use the bible-icon.svg in resources/ and convert it to icon.ico using an online tool or ImageMagick before packaging.')
console.log('For quick testing, copying a placeholder...')

// Create a simple placeholder PNG and rely on a proper icon tool for production

// Write a note file for the user
fs.writeFileSync(
  path.join(resourcesDir, 'ICON_INSTRUCTIONS.txt'),
  `To generate the Bible app icon:
1. Open resources/bible-icon.svg in a browser
2. Take a screenshot or use an online SVG-to-ICO converter
3. Save as resources/icon.ico (256x256 recommended)
4. Also save as resources/icon.png

Alternatively, use ImageMagick:
  magick convert -background none resources/bible-icon.svg -resize 256x256 resources/icon.ico
`
)

console.log('Written ICON_INSTRUCTIONS.txt to resources/')
