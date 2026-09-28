import * as THREE from "three";

const blackHolePosition = new THREE.Vector2(0.5, 0.5);

// Post-processing shader for gravitational lensing around a black hole.
export const BlackHoleShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    blackHolePos: { value: blackHolePosition },
    distortionStrength: { value: 0.15 },
    eventHorizonRadius: { value: 0.12 },
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 blackHolePos;
    uniform float distortionStrength;
    uniform float eventHorizonRadius;
    varying vec2 vUv;

    void main() {
      vec2 dir = vUv - blackHolePos;
      float distToHole = length(dir);
      vec2 direction = distToHole > 0.0001 ? dir / distToHole : vec2(0.0);

      if (distToHole < eventHorizonRadius) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      float lens = distortionStrength / max(distToHole, eventHorizonRadius);
      vec2 distortedUv = clamp(vUv - direction * lens * 0.05, 0.0, 1.0);
      vec4 color = texture2D(tDiffuse, distortedUv);

      float ringStart = eventHorizonRadius;
      float ringEnd = eventHorizonRadius + 0.08;
      float glowEnd = eventHorizonRadius + 0.25;
      float ring = smoothstep(ringStart, ringEnd, distToHole)
        * (1.0 - smoothstep(ringEnd, glowEnd, distToHole));

      float pulse = sin(time * 2.0 + distToHole * 20.0) * 0.5 + 0.5;
      vec3 ringColor = mix(
        vec3(1.0, 0.4, 0.1),
        vec3(0.2, 0.6, 1.0),
        pulse
      );
      color.rgb += ringColor * ring * 2.5;

      gl_FragColor = color;
    }
  `,
};

// Procedural cosmic background used by the standalone Three.js demo.
export const CosmicBackgroundShader = {
  uniforms: {
    time: { value: 0 },
    resolution: {
      value: new THREE.Vector2(
        typeof window === "undefined" ? 1 : window.innerWidth,
        typeof window === "undefined" ? 1 : window.innerHeight,
      ),
    },
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float time;
    uniform vec2 resolution;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 5; i++) {
        value += amplitude * noise(p);
        p *= 2.0;
        amplitude *= 0.5;
      }
      return value;
    }

    void main() {
      vec2 st = gl_FragCoord.xy / max(resolution.xy, vec2(1.0));
      st.x *= resolution.x / max(resolution.y, 1.0);

      vec2 q = vec2(
        fbm(st + 0.05 * time),
        fbm(st + vec2(1.0))
      );
      vec2 r = vec2(
        fbm(st + q + vec2(1.7, 9.2) + 0.15 * time),
        fbm(st + q + vec2(8.3, 2.8) + 0.126 * time)
      );
      float field = fbm(st + r);

      vec3 color = mix(
        vec3(0.02, 0.01, 0.05),
        vec3(0.08, 0.04, 0.2),
        clamp(field * field * 4.0, 0.0, 1.0)
      );
      color = mix(color, vec3(0.4, 0.1, 0.5), clamp(length(q), 0.0, 1.0));
      color = mix(color, vec3(0.1, 0.5, 0.8), clamp(r.x, 0.0, 1.0));

      gl_FragColor = vec4(color * (field * 0.9 + 0.3), 1.0);
    }
  `,
};
