import { useState, useEffect, useCallback } from 'react'

import { overlayOwnsKeyboard } from '@/lib/overlays'

interface UseListKeyboardNavOptions<T> {
    items: T[]
    onSelect?: (item: T, index: number) => void
    onOpen?: (item: T, index: number) => void
    onEscape?: () => void
    enabled?: boolean
}

export function useListKeyboardNav<T>({
    items,
    onSelect,
    onOpen,
    onEscape,
    enabled = true,
}: UseListKeyboardNavOptions<T>) {
    const [activeIndex, setActiveIndex] = useState(-1)

    // Reset when items change
    useEffect(() => {
        setActiveIndex(-1)
    }, [items])

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!enabled || items.length === 0) return

        // Don't intercept when typing in inputs
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

        /*
         * These bindings live on `window`, so they fire for keys an overlay is
         * already handling. While a dialog or menu is up it owns the keyboard:
         * otherwise "j" scrolled the list behind an open modal, and Escape both
         * closed the modal and cleared the list's selection in one press.
         */
        if (overlayOwnsKeyboard()) return

        switch (e.key) {
            case 'j': {
                e.preventDefault()
                setActiveIndex(prev => {
                    const next = Math.min(prev + 1, items.length - 1)
                    onSelect?.(items[next], next)
                    return next
                })
                break
            }
            case 'k': {
                e.preventDefault()
                setActiveIndex(prev => {
                    const next = Math.max(prev - 1, 0)
                    onSelect?.(items[next], next)
                    return next
                })
                break
            }
            case 'Enter': {
                if (activeIndex >= 0 && activeIndex < items.length) {
                    e.preventDefault()
                    onSelect?.(items[activeIndex], activeIndex)
                }
                break
            }
            case 'o': {
                if (activeIndex >= 0 && activeIndex < items.length) {
                    e.preventDefault()
                    onOpen?.(items[activeIndex], activeIndex)
                }
                break
            }
            case 'Escape': {
                e.preventDefault()
                setActiveIndex(-1)
                onEscape?.()
                break
            }
        }
    }, [enabled, items, activeIndex, onSelect, onOpen, onEscape])

    useEffect(() => {
        // Capture phase so the overlay check above sees the layer stack as it was
        // when the key was pressed, not after Radix has already torn a layer down.
        window.addEventListener('keydown', handleKeyDown, true)
        return () => window.removeEventListener('keydown', handleKeyDown, true)
    }, [handleKeyDown])

    return { activeIndex, setActiveIndex }
}
