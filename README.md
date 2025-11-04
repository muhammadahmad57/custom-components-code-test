# Code Test: Movement Component System Prototype

Build a standalone prototype that demonstrates the core Movement component system architecture.

## What You're Building

A simple web app that:
1. Lets users write Vue components in a CodeMirror editor
2. Compiles them using WebContainers
3. Extracts props automatically
4. Renders the component with a props UI
5. Provides the $mvt global runtime

## Getting Started

### Prerequisites
- Node.js 18+ installed
- A modern browser (Chrome/Edge recommended for WebContainer support)

### Setup (2 minutes)

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

The app will open at `http://localhost:3000`

**Important:** WebContainers require special CORS headers which are configured in `vite.config.js`. The dev server must be running for the app to work properly.

## Your Task

This is a Vue 3 application. Complete the TODOs in the following files:

### `src/App.vue`
1. **TODO 1**: Initialize WebContainer and compile Vue SFC when the user clicks "Compile Component"
2. **TODO 2**: Extract props from the Vue component and convert to JSON Schema format
   - Parse the Vue component's `props` definition
   - Convert Vue types (String, Number) to JSON Schema types (string, number)
   - Extract `default` values and `mvt.description` into the schema
   - Map `mvt.min`/`mvt.max` to `minimum`/`maximum` for number types
   - Return a proper JSON Schema object (see [JSON Schema spec](https://json-schema.org/))
   - The schema will automatically display in the right panel
3. **TODO 4**: Mount the compiled component in the preview panel

### `src/runtime.js`
4. **TODO 5**: Implement the `$mvt.store` methods (localStorage is recommended)

A sample Vue component is provided in the CodeMirror editor to help you get started. It includes props with custom `mvt` metadata that should be extracted. The app structure and reactive data bindings are already set up - you just need to implement the compilation, extraction, and mounting logic.

## Deliverables

1. GitHub repo with your completed solution
2. Update this README with your architectural decisions and any notes

## Time Limit: 24 hours

## Your Notes

### Architecture Decisions

**WebContainer Initialization:**
- Used the window object to initialize the WebContainer once to avoid reinitialization delays across components.
- Mounts a file system with `package.json` (including `@vue/compiler-sfc` dependency) and a `compile.js` script on first initialization.

**Compilation Process:**
- **Actually uses WebContainer** to compile Vue SFCs:
  1. Writes the user's Vue component source code to `/component.vue` in the WebContainer filesystem
  2. Executes a Node.js script (`compile.js`) that uses `@vue/compiler-sfc` to compile the Vue SFC
  3. Captures the compiled JavaScript output from the WebContainer process
  4. Transforms the ES module code to work in the browser context by replacing `import` statements with function arguments
  5. Executes the transformed code to extract the component definition
  6. Mounts the compiled component using Vue's `createApp` and `h` functions

**Props Extraction:**
- Located the props object in the component source using string parsing
- Used `eval()` to parse the props definition into a JavaScript object
- Applied a typeMap to convert Vue prop types (String, Number) to JSON Schema types (string, number)
- Extracts `mvt` metadata (description, min, max) and maps them to JSON Schema properties

**Component Rendering:**
- Used `createApp` and `h` to dynamically render the compiled component in the preview area
- Props values are reactively bound to input fields and passed to the component

**Runtime:**
- Implemented `$mvt.store` using localStorage with JSON serialization
- Global `$mvt` object is available to all compiled components
