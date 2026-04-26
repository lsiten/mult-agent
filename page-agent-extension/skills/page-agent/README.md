# Page Agent Skill

A Claude Skill for browser automation through the Page Agent Chrome extension.

## Features

- **Navigate**: Open any URL in the browser
- **Click**: Click elements by CSS selector
- **Fill**: Fill input fields with text
- **Scroll**: Scroll pages or elements
- **Type**: Type text with optional delay
- **Press**: Press keyboard keys
- **Select**: Select dropdown options
- **Hover**: Hover over elements
- **Screenshot**: Capture page screenshots
- **Get Info**: Get page information

## Installation

```bash
npx skills add page-agent-skill
```

Or install from source:

```bash
cd skills/page-agent
npm install
```

## Configuration

1. Install the **Page Agent (MCP)** Chrome extension
2. Load the extension in Chrome developer mode
3. Pin the extension for easy access

## Usage

### Basic Actions

```typescript
// Navigate to a URL
await page_agent({ action: "navigate", url: "https://github.com" })

// Click an element
await page_agent({ action: "click", selector: "#submit-button" })

// Fill an input
await page_agent({ action: "fill", selector: "#email", text: "user@example.com" })

// Scroll down
await page_agent({ action: "scroll", direction: "down" })

// Get page info
await page_agent({ action: "get_info" })
```

### Advanced Actions

```typescript
// Type with delay
await page_agent({ action: "type", selector: "#search", text: "query", delay: 100 })

// Press keyboard key
await page_agent({ action: "press", key: "Enter" })

// Select dropdown option
await page_agent({ action: "select", selector: "#country", value: "US" })

// Hover element
await page_agent({ action: "hover", selector: ".dropdown" })
```

## Example Tasks

1. **Login to a website**
   ```typescript
   await page_agent({ action: "navigate", url: "https://github.com/login" })
   await page_agent({ action: "fill", selector: "#login_field", text: "myemail@example.com" })
   await page_agent({ action: "fill", selector: "#password", text: "mypassword" })
   await page_agent({ action: "click", selector: "input[type=submit]" })
   ```

2. **Fill a contact form**
   ```typescript
   await page_agent({ action: "fill", selector: "#name", text: "John Doe" })
   await page_agent({ action: "fill", selector: "#email", text: "john@example.com" })
   await page_agent({ action: "fill", selector: "#message", text: "Hello!" })
   await page_agent({ action: "click", selector: "#submit" })
   ```

3. **Search and browse**
   ```typescript
   await page_agent({ action: "navigate", url: "https://google.com" })
   await page_agent({ action: "fill", selector: "input[name=q]", text: "search query" })
   await page_agent({ action: "press", key: "Enter" })
   ```

## Requirements

- Chrome browser with Page Agent (MCP) extension installed
- Extension must be loaded and running

## License

MIT
