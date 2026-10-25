import {readdir,stat,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const pkg=JSON.parse(await readFile('package.json','utf8')),version=pkg.version;
const target=resolve(process.env.CARGO_TARGET_DIR??'src-tauri/target','release');
const archive=join('release',`Horizon-${version}-${process.platform}-${process.arch}.zip`);
if((await stat(archive)).size<1000000)throw new Error('Portable archive is unexpectedly small');
if(process.platform==='linux'){
 const output=execFileSync('ldd',[join(target,'claude-local-desktop')],{encoding:'utf8'});
 if(output.includes('not found'))throw new Error('Missing Linux runtime library: '+output);
 const debs=(await readdir(join(target,'bundle/deb'))).filter(name=>name.endsWith('.deb'));
 const images=(await readdir(join(target,'bundle/appimage'))).filter(name=>name.endsWith('.AppImage'));
 if(!debs.length||!images.length)throw new Error('Linux DEB and AppImage are both required');
 const control=execFileSync('dpkg-deb',['--field',join(target,'bundle/deb',debs[0])],{encoding:'utf8'});
 if(!control.includes('libgbm1'))throw new Error('Ubuntu runtime dependency libgbm1 is missing from the DEB');
 console.log(control);
}else if(process.platform==='darwin'){
 if(!(await readdir(join(target,'bundle/dmg'))).some(name=>name.endsWith('.dmg')))throw new Error('macOS DMG is missing');
 const apps=(await readdir(join(target,'bundle/macos'))).filter(name=>name.endsWith('.app'));
 if(apps.length!==1)throw new Error('Expected one macOS application bundle');
 execFileSync('codesign',['--verify','--deep',join(target,'bundle/macos',apps[0])],{stdio:'inherit'});
}else if(process.platform==='win32'){
 if(!(await readdir(join(target,'bundle/nsis'))).some(name=>name.endsWith('.exe')))throw new Error('Windows installer is missing');
}
console.log(`Verified ${process.platform}/${process.arch} package layout for Horizon ${version}`);
