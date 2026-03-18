'use client'
import { useState, useCallback } from 'react'

export function useFormValidation(schema) {
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})

  const validateField = useCallback((name, value) => {
    const rules = schema[name]
    if (!rules) return null
    if (rules.required && (!value || String(value).trim() === '')) return rules.requiredMsg || 'Campo obrigatório'
    if (value && rules.min && String(value).length < rules.min) return `Mínimo ${rules.min} caracteres`
    if (value && rules.max && String(value).length > rules.max) return `Máximo ${rules.max} caracteres`
    if (value && rules.pattern && !rules.pattern.test(String(value))) return rules.patternMsg || 'Formato inválido'
    if (value && rules.custom) return rules.custom(value)
    return null
  }, [schema])

  const handleBlur = useCallback((name, value) => {
    setTouched(prev => ({ ...prev, [name]: true }))
    const error = validateField(name, value)
    setErrors(prev => ({ ...prev, [name]: error }))
  }, [validateField])

  const handleChange = useCallback((name, value) => {
    if (touched[name]) {
      const error = validateField(name, value)
      setErrors(prev => ({ ...prev, [name]: error }))
    }
  }, [touched, validateField])

  const validateAll = useCallback((values) => {
    const newErrors = {}
    Object.keys(schema).forEach(name => {
      const error = validateField(name, values[name])
      if (error) newErrors[name] = error
    })
    setErrors(newErrors)
    setTouched(Object.keys(schema).reduce((acc, k) => ({ ...acc, [k]: true }), {}))
    return Object.keys(newErrors).length === 0
  }, [schema, validateField])

  const clearErrors = useCallback(() => {
    setErrors({})
    setTouched({})
  }, [])

  return { errors, touched, handleBlur, handleChange, validateAll, clearErrors }
}
