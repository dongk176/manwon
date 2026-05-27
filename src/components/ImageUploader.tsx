'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { getDisplayImageUrl, uploadImageFile } from '@/lib/manwonApi'

export type ImageRecord = {
  imageUrl: string
  storageKey: string
  sortOrder: number
  previewUrl?: string
}

export type PersistedImageRecord = Omit<ImageRecord, 'previewUrl'>

const maxImageUploadSizeBytes = 5 * 1024 * 1024
const maxImageUploadSizeLabel = '5MB'

export function getImagePreviewUrl(image: ImageRecord) {
  return image.previewUrl ?? getDisplayImageUrl(image) ?? image.imageUrl
}

export function toPersistedImages(images: ImageRecord[]): PersistedImageRecord[] {
  return images
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ imageUrl, storageKey, sortOrder }) => ({ imageUrl, storageKey, sortOrder }))
}

export function useImagePreviewCleanup(images: ImageRecord[]) {
  const imagesRef = useRef(images)

  useEffect(() => {
    const activePreviewUrls = new Set(images.map((image) => image.previewUrl).filter((url): url is string => Boolean(url)))
    imagesRef.current.forEach((image) => {
      if (image.previewUrl?.startsWith('blob:') && !activePreviewUrls.has(image.previewUrl)) {
        URL.revokeObjectURL(image.previewUrl)
      }
    })
    imagesRef.current = images
  }, [images])

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((image) => {
        if (image.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(image.previewUrl)
      })
    }
  }, [])
}

export function ImageUploader({
  title,
  optional,
  required,
  images,
  onChange,
  maxCount = 5,
}: {
  title: string
  optional?: boolean
  required?: boolean
  images: ImageRecord[]
  onChange: (images: ImageRecord[]) => void
  maxCount?: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'error' | 'too-large'>('idle')
  const sortedImages = images.slice().sort((a, b) => a.sortOrder - b.sortOrder)

  async function handleFile(file: File | undefined) {
    if (!file || images.length >= maxCount) return
    if (file.size > maxImageUploadSizeBytes) {
      setUploadState('too-large')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setUploadState('uploading')
    const previewUrl = URL.createObjectURL(file)
    try {
      const uploaded = await uploadImageFile(file, 'task-post')
      onChange([...sortedImages, { ...uploaded, sortOrder: sortedImages.length, previewUrl }])
      setUploadState('idle')
    } catch {
      URL.revokeObjectURL(previewUrl)
      setUploadState('error')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function openImageAdd() {
    setUploadState('idle')
    inputRef.current?.click()
  }

  function removeImage(removeIndex: number) {
    const removed = sortedImages[removeIndex]
    if (removed?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl)
    onChange(sortedImages.filter((_, index) => index !== removeIndex).map((image, index) => ({ ...image, sortOrder: index })))
  }

  return (
    <section className="step-card image-uploader-card">
      <div className="step-card-title">
        <h3>{title}</h3>
        {optional && <span>선택</span>}
        {required && <span className="is-required">필수</span>}
      </div>
      <div className="image-uploader-list">
        {sortedImages.map((image, index) => (
          <span className="image-thumb" key={`${image.storageKey}-${index}`} style={{ backgroundImage: `url("${getImagePreviewUrl(image)}")` }}>
            <button className="image-thumb-remove" type="button" onClick={() => removeImage(index)} aria-label="이미지 삭제">
              <X size={14} />
            </button>
          </span>
        ))}
        {images.length < maxCount && (
          <button className="image-uploader-add-button" type="button" aria-label="이미지 추가" onClick={openImageAdd}>
            <ImagePlus size={24} />
          </button>
        )}
        <input
          ref={inputRef}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </div>
      <p className="image-upload-hint">최대 {maxCount}장까지 첨부할 수 있어요. 현재 {images.length}장</p>
      {uploadState === 'uploading' && <p className="inline-status">사진을 업로드하는 중입니다.</p>}
      {uploadState === 'error' && <p className="inline-status is-error">사진 업로드에 실패했습니다.</p>}
      {uploadState === 'too-large' && <p className="inline-status is-error">사진은 파일당 {maxImageUploadSizeLabel} 이하만 첨부할 수 있어요.</p>}
    </section>
  )
}
