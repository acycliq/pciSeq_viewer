/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/quickselect@2.0.0/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
function d(v,u,o,M,n){x(v,u,o||0,M||v.length-1,n||C)}function x(v,u,o,M,n){for(;M>o;){if(M-o>600){var w=M-o+1,i=u-o+1,l=Math.log(w),h=.5*Math.exp(2*l/3),q=.5*Math.sqrt(l*h*(w-h)/w)*(i-w/2<0?-1:1),p=Math.max(o,Math.floor(u-i*h/w+q)),s=Math.min(M,Math.floor(u+(w-i)*h/w+q));x(v,u,p,s,n)}var f=v[u],c=o,a=M;for(e(v,o,u),n(v[M],f)>0&&e(v,o,M);c<a;){for(e(v,c,a),c++,a--;n(v[c],f)<0;)c++;for(;n(v[a],f)>0;)a--}n(v[o],f)===0?e(v,o,a):(a++,e(v,a,M)),a<=u&&(o=a+1),u<=a&&(M=a-1)}}function e(v,u,o){var M=v[u];v[u]=v[o],v[o]=M}function C(v,u){return v<u?-1:v>u?1:0}export{d as default};
//# sourceMappingURL=/sm/9da4ad06800aff5a71769efff6b212548e2b5fdf3c98c032034af711fd203689.map