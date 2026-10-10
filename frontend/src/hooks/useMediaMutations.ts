import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { MediaItem } from '../types/media'

export function useAddItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: Omit<MediaItem, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'source' | 'external_id'>) => {
      const { error } = await supabase.from('media_items').insert({
        ...data,
        source: 'manual',
        external_id: null,
      })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-items'] })
    },
  })
}

export function useUpdateItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Omit<MediaItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>> }) => {
      const { error } = await supabase
        .from('media_items')
        .update(data)
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-items'] })
    },
  })
}

export function useDeleteItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('media_items')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-items'] })
    },
  })
}
