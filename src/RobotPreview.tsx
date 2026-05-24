export function RobotPreview() {
  return (
    <div className="robot-preview" aria-hidden="true">
      <svg viewBox="0 0 720 520" role="img">
        <defs>
          <linearGradient id="robotRail" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#f4fbf5" />
            <stop offset="54%" stopColor="#b8c8bd" />
            <stop offset="100%" stopColor="#eef8f0" />
          </linearGradient>
          <linearGradient id="robotAccent" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#f3c86f" />
            <stop offset="100%" stopColor="#74c5aa" />
          </linearGradient>
          <filter id="robotShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="22" stdDeviation="18" floodColor="#06100d" floodOpacity="0.38" />
          </filter>
        </defs>

        <ellipse className="robot-shadow" cx="360" cy="405" rx="240" ry="58" />
        <g className="robot-body" filter="url(#robotShadow)">
          <path className="robot-deck" d="M167 283 354 190 552 271 366 371Z" />
          <path className="robot-side" d="M167 283 366 371 366 409 167 320Z" />
          <path className="robot-front" d="M366 371 552 271 552 309 366 409Z" />

          <path className="robot-rail" d="M195 278 356 199 526 269" />
          <path className="robot-rail" d="M184 315 366 397 535 305" />
          <path className="robot-crossbar" d="M249 250 441 334" />
          <path className="robot-crossbar" d="M451 238 269 336" />

          <g className="robot-wheel robot-wheel-a">
            <ellipse cx="199" cy="331" rx="39" ry="22" />
            <path d="M168 321 230 350" />
          </g>
          <g className="robot-wheel robot-wheel-b">
            <ellipse cx="320" cy="386" rx="42" ry="23" />
            <path d="M286 375 354 405" />
          </g>
          <g className="robot-wheel robot-wheel-c">
            <ellipse cx="496" cy="318" rx="43" ry="24" />
            <path d="M461 307 532 339" />
          </g>

          <path className="robot-column" d="M421 228 459 247 459 134 421 116Z" />
          <path className="robot-arm" d="M449 130 554 177 532 196 426 148Z" />
          <path className="robot-claw" d="M526 190 593 217 576 230 514 204Z" />
          <path className="robot-claw robot-claw-lower" d="M518 207 581 238 559 251 500 219Z" />
          <path className="robot-control" d="M270 247 344 281 344 329 270 296Z" />
          <path className="robot-led" d="M282 253 333 277" />
        </g>
      </svg>
    </div>
  )
}
