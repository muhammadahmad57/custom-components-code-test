<template>
  <div class="container">
    <div class="editor-panel">
      <h2>Component Editor</h2>
      <textarea ref="editorElement"></textarea>
      <button @click="compileComponent" class="compile-btn">
        Compile Component
      </button>
    </div>

    <div class="right-panel">
      <div class="props-panel">
        <h2>Props Schema</h2>
        <div class="props-schema">
          <!-- Displays extracted props as JSON schema -->
          <pre v-if="!propsSchema" class="empty-state">
Compile a component to see props schema</pre>
          <pre v-else>{{ JSON.stringify(propsSchema, null, 2) }}</pre>
        </div>

        <!-- Displays extracted props as input fields -->
        <div v-if="propsSchema?.properties" class="props-inputs">
          <h3>Props Values</h3>
          <div v-for="(propDef, propName) in propsSchema.properties" :key="propName" class="prop-input">
            <label>{{ propName }}</label>
            <input v-if="propDef.type === 'string'" v-model="propValues[propName]" type="text"
              :placeholder="propDef.default" />
            <input v-else-if="propDef.type === 'number'" v-model.number="propValues[propName]" type="number"
              :placeholder="propDef.default" :min="propDef.minimum" :max="propDef.maximum" />
          </div>
        </div>
      </div>

      <div class="preview-panel">
        <h2>Component Preview</h2>
        <div ref="componentMount" class="component-mount">
          <!-- TODO 4: Compiled component will mount here -->
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, createApp, h, reactive, computed, watch, onUnmounted, defineComponent } from "vue";
import CodeMirror from "codemirror";
import "codemirror/lib/codemirror.css";
import "codemirror/mode/vue/vue.js";
import { WebContainer } from "@webcontainer/api";

export default {
  name: "App",
  setup() {
    const editorElement = ref(null);
    const componentMount = ref(null);
    const propsSchema = ref(null);
    const propValues = ref({});

    let editor = null;

    // Sample component to start with
    const sampleComponent = `<template>
  <div class="metric-card">
    <h3>{{ title }}</h3>
    <p>Count: {{ count }}</p>
    <button @click="increment">+1</button>
  </div>
</template>

<script>
export default {
  props: {
    title: {
      type: String,
      default: 'My Counter',
      mvt: {
        type: 'text',
        description: 'Counter title'
      }
    },
    startValue: {
      type: Number,
      default: 0,
      mvt: {
        type: 'number',
        description: 'Starting value',
        min: 0,
        max: 100
      }
    }
  },
  data() {
    return {
      count: this.startValue
    }
  },
  methods: {
    async increment() {
      this.count++
      await $mvt.store.setItem('count', this.count)
    }
  }
}
<\/script>`;

    onMounted(() => {
      // Initialize CodeMirror
      editor = CodeMirror.fromTextArea(editorElement.value, {
        mode: "vue",
        theme: "default",
        lineNumbers: true,
      });

      editor.setValue(sampleComponent);
    });

    // TODO 1: Initialize WebContainer and compile Vue SFC
    async function compileComponentHandler() {
      const source = editor.getValue();
      console.log("Compiling component:", source);

      // 1. Initialize WebContainer (if not already initialized)
      if (!window.webContainerInstance) {
        window.webContainerInstance = await WebContainer.boot();
        await window.webContainerInstance.mount({
          'package.json': {
            file: {
              contents: JSON.stringify({
                name: 'vue-compiler',
                type: 'module',
                dependencies: {
                  '@vue/compiler-sfc': '^3.4.0',
                  'vue': '^3.4.0'
                }
              }, null, 2)
            }
          },
          'compile.js': {
            file: {
              contents: `
import { readFile } from 'node:fs/promises';
import { compile } from '@vue/compiler-sfc';

const source = await readFile('./component.vue', 'utf-8');
const result = compile(source, {
  filename: 'component.vue',
  sourceMap: false
});

// Output the compiled code
console.log(JSON.stringify({
  code: result.code,
  errors: result.errors?.map(e => e.message) || []
}));
`
            }
          }
        });

        // Install dependencies
        const installProcess = await window.webContainerInstance.spawn('npm', ['install']);
        await installProcess.exit;
      }

      const container = window.webContainerInstance;

      // 2. Write the Vue component file to WebContainer
      await container.fs.writeFile('/component.vue', source);

      // 3. Compile the Vue SFC using WebContainer
      const compileProcess = await container.spawn('node', ['compile.js']);
      
      let compiledOutput = '';
      compileProcess.output.pipeTo(
        new WritableStream({
          write(data) {
            compiledOutput += data;
          }
        })
      );

      const exitCode = await compileProcess.exit;
      
      if (exitCode !== 0) {
        console.error('Compilation failed:', compiledOutput);
        alert('Compilation failed. Check console for details.');
        return;
      }

      // Parse the compiled output
      let compiledResult;
      try {
        compiledResult = JSON.parse(compiledOutput.trim());
      } catch (e) {
        // Try to extract JSON from the output (might have extra logs)
        const jsonMatch = compiledOutput.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          compiledResult = JSON.parse(jsonMatch[0]);
        } else {
          console.error('Failed to parse compilation output:', compiledOutput);
          alert('Failed to parse compilation result.');
          return;
        }
      }

      if (compiledResult.errors && compiledResult.errors.length > 0) {
        console.error('Compilation errors:', compiledResult.errors);
        alert('Compilation errors: ' + compiledResult.errors.join(', '));
        return;
      }

      // Evaluate the compiled code to get the component
      let compiledCode = compiledResult.code;
      
      // Transform ES module imports to work in our context
      // Map of Vue imports to their argument indices
      const vueImportMap = {
        'h': 0,
        'createApp': 1,
        'ref': 2,
        'reactive': 3,
        'computed': 4,
        'watch': 5,
        'onMounted': 6,
        'onUnmounted': 7,
        'defineComponent': 8
      };
      
      // Replace import statements with variable assignments from function arguments
      compiledCode = compiledCode.replace(
        /import\s+{\s*([^}]+)\s*}\s+from\s+['"]vue['"];?/g,
        (match, imports) => {
          const importList = imports.split(',').map(i => i.trim());
          return importList.map(imp => {
            // Handle "as" aliases and default imports
            const parts = imp.split(' as ').map(p => p.trim());
            const varName = parts[0];
            const alias = parts[1] || parts[0];
            const argIndex = vueImportMap[varName];
            if (argIndex !== undefined) {
              return `const ${alias} = arguments[${argIndex}];`;
            }
            // Fallback for unknown imports
            return `const ${alias} = arguments[0]; // fallback for ${varName}`;
          }).join('\n');
        }
      );
      
      // Inject Vue functions as function arguments
      // The compiled code will reference these via arguments[0], arguments[1], etc.
      compiledCode = `
        ${compiledCode}
      `;
      
      // Transform export statements to return the component
      compiledCode = compiledCode.replace(
        /export\s+default\s+([^;]+);?/,
        'const __COMPONENT__ = $1;'
      );
      
      // Wrap in a function that returns the component
      const componentCode = `
        ${compiledCode}
        return typeof __COMPONENT__ !== 'undefined' ? __COMPONENT__ : null;
      `;
      
      // Execute the transformed code
      const getComponent = new Function(componentCode);
      
      const Component = getComponent(
        h, createApp, ref, reactive, computed, watch, onMounted, onUnmounted, defineComponent
      );
      
      if (!Component) {
        console.error('Failed to extract component from compiled code');
        alert('Failed to extract component from compiled code.');
        return;
      }

      // 4. Extract props from the component
      propsSchema.value = extractProps(source);

      // Initialize prop values using defaults
      if (propsSchema.value?.properties) {
        for (const [key, prop] of Object.entries(propsSchema.value.properties)) {
          propValues.value[key] = prop.default;
        }
      }

      // 5. Mount the component with the current prop values
      const mountEl = componentMount.value;
      mountEl.innerHTML = "";

      // Clear any existing app instance
      if (window.compiledAppInstance) {
        window.compiledAppInstance.unmount();
      }

      // Store Component globally so we can re-render when props change
      window.compiledComponent = Component;
      
      const renderComponent = () => {
        return h(Component, propValues.value);
      };

      const app = createApp({
        render: renderComponent,
      });
      
      // Store app instance for cleanup and re-rendering
      window.compiledAppInstance = app;
      app.mount(mountEl);
      
      // Watch propValues and re-render component when props change
      watch(propValues, () => {
        if (window.compiledAppInstance && window.compiledComponent) {
          // Unmount and remount with new props
          window.compiledAppInstance.unmount();
          mountEl.innerHTML = "";
          const newApp = createApp({
            render: () => h(window.compiledComponent, propValues.value),
          });
          window.compiledAppInstance = newApp;
          newApp.mount(mountEl);
        }
      }, { deep: true });
    }

    // TODO 2: Extract props from Vue component and convert to JSON Schema
    function extractProps(componentSource) {

      // Find prop block
      const propsIndex = componentSource.indexOf("props:");
      if (propsIndex === -1) return null;

      let braceCount = 0;
      let start = componentSource.indexOf("{", propsIndex);
      if (start === -1) return null;

      let end = start;
      for (let i = start; i < componentSource.length; i++) {
        if (componentSource[i] === "{") braceCount++;
        if (componentSource[i] === "}") braceCount--;
        if (braceCount === 0) {
          end = i;
          break;
        }
      }

      const propsCode = componentSource.slice(start, end + 1);
      let props;
      try {
        props = eval(`(${propsCode})`);
      }
      catch (error) {
        console.error("Error parsing props:", error);
        return null;
      }

      // Build JSON Schema from props
      const schema = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {},
      };

      const typeMap = { String: "string", Number: "number" };

      // Loop through props and build schema
      for (const [name, def] of Object.entries(props)) {

        // Determine prop type
        const type = typeMap[def.type?.name] || "string";

        // Create schema for single prop
        const propSchema = {
          type,
          description: def.mvt?.description || "",
          default: def.default,
        };

        // handle number type with min/max
        if (type === "number") {
          if (def.mvt?.min !== undefined) propSchema.minimum = def.mvt.min;
          if (def.mvt?.max !== undefined) propSchema.maximum = def.mvt.max;
        }

        // Add prop to schema
        schema.properties[name] = propSchema;
      }

      console.log("Schema (JSON):", JSON.stringify(schema, null, 2));
      return schema;
    }

    return {
      editorElement,
      componentMount,
      propsSchema,
      propValues,
      compileComponent: compileComponentHandler,
    };
  },
};
</script>
