import { memo, useId } from 'react'
import Svg, { Defs, G, LinearGradient, Mask, Path, Rect, Stop } from 'react-native-svg'
import { CHARACTERS, lookOf } from '../vendor/ds-bot/characters.js'
import { GRADIENTS, INKS, inkFill } from '../vendor/ds-bot/inks.js'
import type { GroupBot } from './group-types'

/** Desktop artwork with native paint values: Android SVG cannot resolve CSS vars. */
export const GroupCharacter = memo(function GroupCharacter({ bot, size, dark }: { bot?: GroupBot; size: number; dark: boolean }) {
  const id = `group${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const look = lookOf(bot)
  const character = CHARACTERS[look.shape] ?? CHARACTERS.gumdrop!
  const stops = GRADIENTS[look.color]
  const desktopInk = inkFill(look.color)
  const inkName = /^var\(--bt-ink-([a-z]+)\)$/.exec(desktopInk)?.[1]
  const paint = inkName ? (INKS[inkName] ?? INKS.gray!)[dark ? 1 : 0] : desktopInk
  return <Svg width={size} height={size} viewBox="0 0 100 100">
    <Defs>
      {stops && <LinearGradient id={`${id}g`} gradientUnits="userSpaceOnUse" x1={18} y1={10} x2={78} y2={92}>
        {stops.map(([offset, color]) => <Stop key={offset} offset={offset} stopColor={color} />)}
      </LinearGradient>}
      <Mask id={id} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" maskType="luminance" x={-100} y={-100} width={300} height={300}>
        <Rect x={-100} y={-100} width={300} height={300} fill="#fff" />
        {character.eyes.map(([cx, cy, width, height, tilt], index) => <G key={index} transform={`translate(${cx} ${cy}) rotate(${tilt})`}>
          <Rect x={-width / 2} y={-height / 2} width={width} height={height} rx={width / 2} fill="#000" />
        </G>)}
      </Mask>
    </Defs>
    <G mask={`url(#${id})`} fillRule="evenodd">
      <Path d={character.body} fill={stops ? `url(#${id}g)` : paint} />
      {character.paints?.map(([d, fill, opacity], index) => <Path key={index} d={d} fill={fill} fillOpacity={opacity} />)}
      <Path d={character.shade} fill="#000" fillOpacity={0.14} />
      <Path d={character.light} fill="#fff" fillOpacity={0.16} />
    </G>
  </Svg>
})
