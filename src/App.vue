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
import { ref, onMounted, createApp, h } from "vue";
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

      // Your implementation here
      // Should:
      // 1. Initialize WebContainer (if not already initialized)
      if (!window.webContainerInstance) {
        window.webContainerInstance = await WebContainer.boot();
      }

      // 2. Compile the Vue SFC to JavaScript

      // Validate Component Existence
      const scriptMatch = source.match(/<script>([\s\S]*)<\/script>/);
      const templateMatch = source.match(/<template>([\s\S]*)<\/template>/);
      if (!scriptMatch || !templateMatch) {
        console.error("Invalid component format");
        return;
      }

      // Extracting JavaScript logic and make it executable
      const scriptContent = scriptMatch[1].replace("export default", "return ");
      const componentOptions = new Function(scriptContent)();

      // Attaching template HTML to the component options
      componentOptions.template = templateMatch[1].trim();

      // 3. Extract props from the component
      propsSchema.value = extractProps(source);

      // Initialize prop values using defaults
      if (propsSchema.value?.properties) {
        for (const [key, prop] of Object.entries(propsSchema.value.properties)) {
          propValues.value[key] = prop.default;
        }
      }

      // 4. Mount the component with the current prop values
      const mountEl = componentMount.value;
      mountEl.innerHTML = "";

      const app = createApp({
        render() {
          return h(componentOptions, propValues.value);
        },
      });
      app.mount(mountEl);
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

      // Printing the schema to the console
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
