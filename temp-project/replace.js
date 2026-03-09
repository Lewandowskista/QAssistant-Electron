const fs = require('fs');
const file = 'src/store/useProjectStore.ts';
let content = fs.readFileSync(file, 'utf8');

const header = `function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

`;

if (!content.includes('function generateId()')) {
    content = content.replace(/import \{ create \} from 'zustand'/g, "import { create } from 'zustand'\n\n" + header);
}
content = content.replace(/crypto\.randomUUID\(\)/g, 'generateId()');
fs.writeFileSync(file, content, 'utf8');
console.log('Replaced UUID calls successfully');
