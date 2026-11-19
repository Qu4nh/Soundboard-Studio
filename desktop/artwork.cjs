const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
// Exact fingerprints of retired bundled artwork. User and community media stay intact.
const retired=new Set([
 '23ae502871473ea31ac0d8c434bbe3c7154c0c477ecffb6984113c28816fac9f',
 '46a80ad6c37b77d1f86463f0aba77318e2270b2aac4fdb94f95285ec8f39ac54',
 '2feb01af9243b2a6084a738c3d1696b4c1a93f32839f24d8332fd1ec72cb6a1f',
 '6d54154b744ba528dedfcd7d046477359c757ed58df095692411421daaae1bcb',
 'cda1d6eddcbe4d7d256d9a79a2e2f86eb16e2eddd1ebe6bb1ebe2e03b3afb060',
 'eb8ab3dc44ddb3c974979178415085d54563ef9a8add94d02e233891bb671970',
 '6887520b3e29f1f017aa0afd77473f94d220864bc0df4d09faa774d45b7bce20'
]);
async function clearRetiredArtwork(data,dir,fingerprints=retired){
 let changed=false;const checked=new Map();
 const bundledURL=value=>{if(typeof value!=='string')return false;if(/^\/?(?:\.\/)?reference\//.test(value))return true;try{return fingerprints.has(new URL(value).pathname.split('/').at(-1));}catch{return false;}};
 const bundledFile=async rel=>{
  if(typeof rel!=='string'||!/^images\/[a-zA-Z0-9_.-]+$/.test(rel))return false;
  if(!checked.has(rel))checked.set(rel,(async()=>{try{const full=path.resolve(dir,rel);if(!full.startsWith(path.resolve(dir,'images')+path.sep)||(await fs.stat(full)).size>5*1024*1024)return false;return fingerprints.has(createHash('sha256').update(await fs.readFile(full)).digest('hex'));}catch{return false;}})());
  return checked.get(rel);
 };
 for(const board of data.boards||[]){if(bundledURL(board.cover)){delete board.cover;changed=true;}if(await bundledFile(board.coverFile)){delete board.coverFile;changed=true;}}
 for(const sound of [...(data.sounds||[]),...(data.community?.items||[])]){if(bundledURL(sound.image)){delete sound.image;changed=true;}if(await bundledFile(sound.imageFile)){delete sound.imageFile;changed=true;}}
 return changed;
}
module.exports={clearRetiredArtwork};
