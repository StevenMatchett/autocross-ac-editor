import {defineConfig} from 'vite';

export default defineConfig(({command,isPreview})=>({
 // Keep local development at /; production assets live under the Pages project.
 base:command==='build'||isPreview?'/autocross-ac-editor/':'/',
}));
