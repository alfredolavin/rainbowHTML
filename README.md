# Rainbow HTML

<p align="center">
  <img src="icon.png" alt="Rainbow HTML Icon" width="128" height="128" style="border-radius: 24px;" />
</p>

<p align="center">
  <strong>Vibrant alternating rainbow colors for HTML tag delimiters and names in VS Code.</strong><br>
  Never get lost in complex nested templates again!
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=alfredolavin.rainbow-html"><img src="https://img.shields.io/badge/VS_Code-Extension-007ACC?logo=visualstudiocode&logoColor=white" alt="VS Code Extension" /></a>
  <a href="https://github.com/alfredolavin/rainbowHTML/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT" /></a>
  <a href="https://github.com/alfredolavin/rainbowHTML"><img src="https://img.shields.io/badge/Author-Alfredo_Lavin-blueviolet.svg" alt="Author Alfredo Lavin" /></a>
</p>

---

## ✨ Features

- ⚡ **Always Active**: Highlighting starts immediately when opening any file or switching tabs—no typing or edits required.
- 🌈 **Vibrant Rainbow Spectrum**: 12 carefully balanced, high-contrast neon and vivid hues designed specifically for both **Dark** and **Light** themes.
- 🔗 **Matched Opening & Closing Tags**: Opening `<tag>` and closing `</tag>` delimiters and names share the exact same color, making it effortless to identify matching pairs in deeply nested code.
- ⚙️ **4 Flexible Color Modes**:
  - `rainbow` *(Default)*: Cycles smoothly across consecutive and nested tags while guaranteeing child tags contrast with their parent.
  - `depth`: Assigns colors based on DOM nesting level depth.
  - `tagNameHash`: Fast hashing mode that maps identical tags to consistent colors with zero clustering.
  - `uniqueTagNames`: Assigns a distinct color from the rainbow palette to each unique tag name in the document.
- 🚀 **Universal Framework Support**:
  - HTML & HTM (`.html`, `.htm`)
  - React & Solid (`.jsx`, `.tsx`, `javascriptreact`, `typescriptreact`)
  - Vue Single File Components (`.vue`)
  - Svelte (`.svelte`)
  - Astro (`.astro`)
  - PHP & Laravel Blade (`.php`, `.blade.php`)
  - Template engines (Nunjucks `.njk`, Twig `.twig`, Handlebars `.hbs`, Razor)
  - XML & SVG (`.xml`, `.svg`)
  - Tagged template literals in JS/TS (`html`...``)
- 🎨 **Fully Customizable**: Add custom color overrides per tag name, configure or disable CSS text shadow glow, or register additional file extensions.

---

## 📸 Overview

```html
<header>                <!-- Coral Red -->
  <nav>                 <!-- Amber Orange -->
    <ul>                <!-- Sunny Yellow -->
      <li>              <!-- Neon Spring Green -->
        <a href="...">  <!-- Vivid Mint -->
          <span>Home</span>
        </a>            <!-- Vivid Mint -->
      </li>             <!-- Neon Spring Green -->
    </ul>               <!-- Sunny Yellow -->
  </nav>                <!-- Amber Orange -->
</header>               <!-- Coral Red -->
```

---

## ⚙️ Configuration

You can customize **Rainbow HTML** in your VS Code settings (`settings.json`):

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `rainbow-html.colorMode` | `string` | `"rainbow"` | Coloring strategy: `"rainbow"` (cycling), `"depth"` (nesting level), `"tagNameHash"` (hash-based), or `"uniqueTagNames"`. |
| `rainbow-html.tagShadow` | `string` | `"1px 1px 2px rgba(0, 0, 0, 0.4)"` | Configurable CSS text-shadow applied to tag names (set to `"none"` to disable). |
| `rainbow-html.tagColors` | `object` | `{}` | Manual color overrides for specific tag names (e.g. `{"div": "#FF5555", "button": "#50FA7B"}`). |
| `rainbow-html.additionalFileTypes` | `array` | `["njk", "nunjucks", "php", "vue", "svelte", "astro", "blade", "twig"]` | Additional file extensions or language IDs to highlight. |

### Example `settings.json`

```json
{
  "rainbow-html.colorMode": "rainbow",
  "rainbow-html.tagShadow": "0px 1px 3px rgba(0, 0, 0, 0.6)",
  "rainbow-html.tagColors": {
    "custom-element": "#FF007F",
    "special-tag": "#00E5FF"
  },
  "rainbow-html.additionalFileTypes": [
    "liquid",
    "erb",
    "mustache"
  ]
}
```

---

## ⌨️ Commands

- `Rainbow HTML: Refresh Highlighting` (`rainbow-html.refresh`): Forces a full re-scan and updates tag decorations across all visible editors.

---

## 🧑‍💻 Author

Developed and maintained with ❤️ by **[Alfredo Lavin](https://github.com/alfredolavin)**.

---

## 📄 License

This extension is licensed under the [MIT License](LICENSE).
