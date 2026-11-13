---
title: SPIRALVISION
date: 2026-03-02
category: code
type: static
summary: Colour video encoded as stereo audio that can be recorded on cassette tape and played back as a spiral.
cover: /assets/screenshots/spiralvision-through-speakers-and-mic-on-a-broken-laptop.done.gif
thumbnail: /assets/thumbnails/spiralvision-through-speakers-and-mic-on-a-broken-laptop.thumb.done.gif
aspect_ratio: 1.333
video_url: https://www.youtube.com/watch?v=k_lY_UmP844
links:
  - label: website
    url: https://sloev.github.io/spiralvision/
  - label: repo
    url: https://github.com/sloev/spiralvision
  - label: video
    url: https://www.youtube.com/watch?v=k_lY_UmP844
---

Video at 10 frames per second in colour, encoded in an ordinary stereo audio signal that can be recorded on cassette and played back. The image is drawn along two interlaced spiral arms. Brightness is frequency-modulated between 3 and 12 kHz; colour is amplitude-modulated, one colour-difference signal per channel. A sync pulse and a calibration chirp in every frame let the decoder correct for tape speed, treble loss and saturation. Without sync, any audio is drawn as spiral noise.

One DSP core in Rust, compiled to WebAssembly for the browser (PWA) and built as apps for Linux, Raspberry Pi, Windows, macOS and Android.

The video shows the signal played through the speakers and picked up by the microphone of a broken laptop.
