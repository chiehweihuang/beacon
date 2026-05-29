# Disability Categories Quick Reference

Based on IAAP CPACC Body of Knowledge + WHO ICF framework.

## Categories

### Visual (V)
- **Blindness**: No functional vision. Uses screen reader (NVDA, JAWS, VoiceOver), braille display. Depends entirely on accessible names, semantic structure, keyboard navigation.
- **Low vision**: Partial sight. Uses screen magnifier (ZoomText), high contrast, large text. Needs sufficient contrast (≥4.5:1), resizable text, reflow layout.
- **Color vision deficiency**: Cannot distinguish certain colors (8% of males). Never convey information by color alone — use shape, text, pattern.

### Auditory (A)
- **Deafness**: No functional hearing. Needs captions, transcripts, sign language video. Deaf culture may prefer sign language over text.
- **Hard of hearing**: Partial hearing. Needs captions, volume controls, clear audio. Avoid background noise in media.

### Motor/Physical (M)
- **Limited fine motor**: Tremors, arthritis, paralysis. Uses alternative keyboard, switch device, voice control, eye tracking. Needs large click targets (≥24×24px), no drag-only interactions, generous timing.
- **Upper limb absence/limitation**: Cannot use standard mouse. Depends on keyboard-only or voice. All functionality must be keyboard-operable.

### Cognitive (C)
- **Learning disabilities**: Dyslexia, dyscalculia. Needs clear language, consistent layout, multiple content formats.
- **Intellectual disabilities**: Limited abstract reasoning. Needs simple language, step-by-step instructions, visual supports.
- **Memory**: Short-term memory limitations. Don't require remembering information across steps (WCAG 3.3.7 Redundant Entry). Provide undo, auto-save.
- **Attention**: ADHD, distractibility. Minimize distractions, allow focus mode, avoid auto-playing media.

### Neurological (N)
- **Epilepsy/Seizure**: Flashing content (>3 per second) can trigger seizures. WCAG 2.3.1 is literally life-safety.
- **Vestibular**: Motion sensitivity. Respect `prefers-reduced-motion`. Avoid parallax, auto-scrolling, zoom animations.

### Speech (S)
- Speech impairments affect voice-input interfaces. Always provide text-based alternatives to voice interactions.

### Psychosocial (P)
- Anxiety, depression, PTSD. Avoid time pressure, guilt-inducing patterns (streaks, "you missed"), unexpected loud sounds. Provide calm, predictable UI.

### Age-related
- Combines vision decline + motor slowing + cognitive changes + hearing loss. Often does not self-identify as "disabled". Design for capability spectrum, not categories.

### Temporary & Situational
- Broken arm (motor), ear infection (auditory), bright sunlight (visual), noisy environment (auditory), holding a baby (one-handed). Universal design benefits everyone.

## POUR × Disability Matrix

| Category | Perceivable | Operable | Understandable | Robust |
|----------|:-----------:|:--------:|:--------------:|:------:|
| Visual | ★★★ | ★★ | ★ | ★★★ |
| Auditory | ★★★ | ★ | ★ | ★★ |
| Motor | ★ | ★★★ | ★ | ★★ |
| Cognitive | ★★ | ★★ | ★★★ | ★ |
| Neurological | ★★ | ★★★ | ★ | ★ |

★★★ = primary | ★★ = secondary | ★ = indirect

## Key Statistics
- 1.3 billion people (16% of global population) have significant disability — WHO 2023
- 2.2 billion have vision impairment — WHO
- By 2050, 2.5 billion will need assistive products — WHO
- 96%+ of top websites have detectable accessibility errors — WebAIM Million 2025
