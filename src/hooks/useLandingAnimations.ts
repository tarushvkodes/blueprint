import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { type RefObject, useEffect } from 'react'

gsap.registerPlugin(ScrollTrigger)

type LandingAnimationRefs = {
  manifestoRef: RefObject<HTMLParagraphElement | null>
  pinnedRef: RefObject<HTMLElement | null>
  refreshKey: unknown
}

export function useLandingAnimations({ manifestoRef, pinnedRef, refreshKey }: LandingAnimationRefs) {
  useEffect(() => {
    const context = gsap.context(() => {
      gsap.fromTo(
        '.hero-copy > *',
        { y: 34, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.05, stagger: 0.12, ease: 'power3.out' },
      )

      gsap.utils.toArray<HTMLElement>('.image-scale').forEach((element) => {
        gsap.fromTo(
          element,
          { scale: 0.84, opacity: 0.52 },
          {
            scale: 1,
            opacity: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: element,
              start: 'top 85%',
              end: 'bottom 20%',
              scrub: true,
            },
          },
        )
      })

      if (pinnedRef.current) {
        ScrollTrigger.create({
          trigger: pinnedRef.current,
          start: 'top top',
          end: 'bottom bottom',
          pin: '.pinned-title',
          pinSpacing: false,
        })
      }

      if (manifestoRef.current) {
        const words = manifestoRef.current.querySelectorAll('span')
        gsap.fromTo(
          words,
          { opacity: 0.12 },
          {
            opacity: 1,
            stagger: 0.035,
            scrollTrigger: {
              trigger: manifestoRef.current,
              start: 'top 80%',
              end: 'bottom 35%',
              scrub: true,
            },
          },
        )
      }
    })

    return () => context.revert()
  }, [manifestoRef, pinnedRef, refreshKey])
}
