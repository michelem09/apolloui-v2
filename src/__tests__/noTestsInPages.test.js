import fs from 'fs';
import path from 'path';

// Next builds every file under src/pages as a route: a test there breaks
// `yarn build` on the device ("jest is not defined" while collecting page data).
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
  );

test('no test files live under src/pages', () => {
  const pages = path.join(__dirname, '..', 'pages');
  const tests = walk(pages).filter((f) => /\.(test|spec)\.[jt]sx?$/.test(f));
  expect(tests).toEqual([]);
});
