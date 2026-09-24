import asset from './assets/nats-cone.json';
import {coneSeed} from './cone-material';
export const natsCone=asset;
export const coneTint=(id:string)=>.94+(coneSeed(id)%61)/1000;
export const natsTextureURL='data:image/png;base64,'+asset.texturePNG;
export const natsTexturePNG=()=>Uint8Array.from(atob(asset.texturePNG),c=>c.charCodeAt(0));
export const assetAttribution=`Cone geometry and ConePaintTexture by Mike Ferchak / schmerchak, from nats-mod.
Source: ${asset.source}
Redistributed with permission reported by the Padwork project owner.
Adaptations: isolated cone templates, normalized to 18 inches, converted DDS to PNG;
original pointer orientation normalized to north, per-cone brightness variation.
Permission for this project is not a general license grant for other projects.
`;
