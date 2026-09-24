import {defineConfig} from 'vite';

export default defineConfig(({command})=>({
 // Keep local development at /; production assets live under the Pages project.
 base:command==='build'?'/autocross-ac-editor/':'/',
}));
