// Registers the server-only resolve hook (see server-only-shim.mjs). Use via
//   node --experimental-strip-types --import ./scripts/server-only-register.mjs <script>
import { register } from "node:module";

register(new URL("./server-only-shim.mjs", import.meta.url));
