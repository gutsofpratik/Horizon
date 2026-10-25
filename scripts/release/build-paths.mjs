import {win32,posix} from 'node:path';
export function releaseTarget(root,env=process.env,platform=process.platform){
 const paths=platform==='win32'?win32:posix;
 const fallback=platform==='win32'?paths.join(env.PUBLIC??'C:/Users/Public','HorizonReleaseTarget'):paths.join(root,'.local/release-target');
 const target=paths.resolve(root,env.CARGO_TARGET_DIR??fallback);
 if(platform==='win32'&&/\s/.test(target))throw new Error('Windows release builds require CARGO_TARGET_DIR without spaces because the GNU resource compiler cannot safely quote its include path. Choose a folder such as C:/Users/Public/HorizonReleaseTarget.');
 return target;
}
