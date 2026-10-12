import { useParams } from 'react-router-dom'
import { AniListTitleDetail } from '../components/AniListTitleDetail'
import NotFound from './NotFound'

export default function TitleDetail() {
  const { kind, id } = useParams()
  const numericId = Number(id)
  if ((kind !== 'anime' && kind !== 'manga') || !Number.isInteger(numericId)) return <NotFound />
  return <AniListTitleDetail key={`${kind}-${numericId}`} kind={kind} id={numericId} />
}
