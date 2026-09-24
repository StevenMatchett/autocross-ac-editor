export type Point = {x:number; y:number};
export function rotatePoint(p:Point,angle:number):Point {
 const c=Math.cos(angle),s=Math.sin(angle);
 return {x:p.x*c-p.y*s,y:p.x*s+p.y*c};
}
export function fitView(viewWidth:number,viewHeight:number,siteWidth:number,siteHeight:number,angle:number){
 const corners=[{x:0,y:0},{x:siteWidth,y:0},{x:0,y:siteHeight},{x:siteWidth,y:siteHeight}].map(p=>rotatePoint(p,angle));
 const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x));
 const minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
 const scale=Math.max(.01,Math.min((viewWidth-100)/(maxX-minX),(viewHeight-100)/(maxY-minY)));
 return {scale,ox:(viewWidth-(maxX-minX)*scale)/2-minX*scale,oy:(viewHeight-(maxY-minY)*scale)/2-minY*scale};
}
