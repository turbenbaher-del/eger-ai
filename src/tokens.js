export const C = {
  bg:"#07111e", surface:"rgba(255,255,255,0.05)", surfaceHi:"rgba(255,255,255,0.09)",
  border:"rgba(255,255,255,0.10)", borderHi:"rgba(46,204,113,0.40)",
  accent:"#2ecc71", accentDim:"rgba(46,204,113,0.15)", accentGlow:"rgba(46,204,113,0.35)",
  blue:"#3b82f6", cyan:"#22d3ee", gold:"#f59e0b",
  text:"#e8f4f0", muted:"rgba(232,244,240,0.58)", dimmer:"rgba(232,244,240,0.45)",
};
export const glass = (extra="") => ({
  background:C.surface, backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)",
  border:`1px solid ${C.border}`, borderRadius:20,
  ...(extra ? {boxShadow:extra} : {}),
});
export const surface = (extra={}) => ({
  background:C.surface, border:`1px solid ${C.border}`, borderRadius:20, ...extra,
});
