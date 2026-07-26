import React, { useState, useEffect, useCallback } from 'react';
import { H2Section } from '../types';
import { generateKanoeImage } from '../services/imageGenerationService';
import { ensure16x9 } from '../services/imageProcessor';

interface H2ProcessingCardProps {
    section: H2Section;
    updateSection: (section: H2Section) => void;
    startProcessing: boolean;
    onProcessingComplete: () => void;
}

export const H2ProcessingCard: React.FC<H2ProcessingCardProps> = ({ section, updateSection, startProcessing, onProcessingComplete }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [editablePrompt, setEditablePrompt] = useState(
        section.prompt + (section.backgroundInstruction ? `\n- **背景の指定:** ${section.backgroundInstruction}` : '')
    );

    const handleGenerate = useCallback(async () => {
        const isFirstGeneration = section.status === 'pending';
        updateSection({ ...section, status: 'generating', errorMessage: null, generationStep: 'カノエくん画像を準備中...' });

        try {
            updateSection({
                ...section,
                status: 'generating',
                prompt: editablePrompt,
                generationStep: 'GPT Image 2で画像を生成中...'
            });

            const generatedImage = await generateKanoeImage(
                section.h2Text,
                section.paragraphText,
                editablePrompt
            );

            console.log(`✅ カノエくん画像生成完了 [H2 #${section.id}]`, {
                h2Text: section.h2Text,
                model: generatedImage.model,
                size: generatedImage.size,
                timestamp: new Date().toISOString()
            });

            updateSection({ ...section, status: 'generating', generationStep: 'ブログ用サイズに調整中...' });
            const finalImage = await ensure16x9(generatedImage.imageDataUrl, 1920, 1080);
            
            updateSection({ 
                ...section, 
                prompt: editablePrompt,
                status: 'success', 
                generatedImage: finalImage, 
                mediaId: null,
                sourceUrl: null,
                generationStep: null,
                errorMessage: null,
            });

        } catch (error: any) {
            // エラーログの詳細出力
            console.error('❌ 画像生成エラー発生:');
            console.error('  - H2タイトル:', section.h2Text);
            console.error('  - セクションID:', section.id);
            console.error('  - エラーメッセージ:', error?.message || 'Unknown error');
            console.error('  - エラータイプ:', error?.name || 'UnknownError');
            console.error('  - ステータスコード:', error?.status || error?.response?.status || 'Unknown');
            console.error('  - 現在のプロンプト長:', editablePrompt?.length || 0);
            console.error('  - タイムスタンプ:', new Date().toISOString());
            console.error('  - 完全なエラー:', error);

            const errorMessage = error instanceof Error ? error.message : "画像生成で不明なエラーが発生しました。";
            updateSection({ ...section, status: 'error', errorMessage, prompt: editablePrompt, generationStep: null });
        } finally {
            if (isFirstGeneration) {
                onProcessingComplete();
            }
        }
    }, [section, updateSection, onProcessingComplete, editablePrompt]);

    useEffect(() => {
        if (startProcessing && section.status === 'pending') {
            handleGenerate();
        }
    }, [startProcessing, section.status, handleGenerate]);


    const getStatusColor = () => {
        switch (section.status) {
            case 'pending': return 'bg-gray-200 text-gray-700';
            case 'generating': return 'bg-blue-200 text-blue-800 animate-pulse';
            case 'success': return 'bg-green-200 text-green-800';
            case 'error': return 'bg-red-200 text-red-800';
        }
    };
    
    const isGenerated = section.status === 'success' || section.status === 'error';
    const buttonText = section.status === 'generating' ? '生成中...' : isGenerated ? '画像を再生成' : '画像を生成';
    const statusText = {
        pending: '未生成',
        generating: '生成中',
        success: '生成完了',
        error: 'エラー',
    }[section.status];


    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="flex-1">
                    <div className="flex items-center">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor()}`}>{statusText}</span>
                        <h3 className="ml-3 text-lg font-semibold text-gray-800">{section.h2Text}</h3>
                    </div>
                </div>
                <button
                    className="text-indigo-600 hover:text-indigo-800"
                >
                    {isExpanded ? '閉じる' : '詳細'}
                </button>
            </div>
            {isExpanded && (
                <div className="p-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h4 className="font-semibold text-gray-700 mb-2">生成内容</h4>
                        <div className="text-sm space-y-3">
                            <div>
                                <p className="font-medium text-gray-600 mb-1">公式キャラクター</p>
                                <span className="text-gray-700">カノエくん（固定）</span>
                            </div>
                            <div>
                                <p className="font-medium text-gray-600">章の内容</p>
                                <p className="mt-1 p-2 bg-gray-50 rounded-md text-gray-700">{section.paragraphText || '見出しをもとに画像を生成します。'}</p>
                            </div>
                             <div className="bg-gray-50 p-3 rounded-md">
                                <label htmlFor={`prompt-${section.id}`} className="font-semibold text-gray-600">追加の表現指示</label>
                                <textarea
                                    id={`prompt-${section.id}`}
                                    value={editablePrompt}
                                    onChange={(e) => setEditablePrompt(e.target.value)}
                                    className="mt-1 block w-full h-48 p-2 text-xs font-mono text-gray-800 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                    aria-label="追加の表現指示"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                        <div className="w-full aspect-video bg-gray-100 rounded-md flex items-center justify-center overflow-hidden">
                        {section.status === 'success' && section.generatedImage && (
                            <img src={section.generatedImage} alt={section.altText} className="w-full h-full object-cover" />
                        )}
                        {section.status === 'generating' && (
                            <div className="text-center text-gray-500 p-4">
                                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
                                <p className="mt-2 font-semibold">カノエくん画像を生成中...</p>
                                {section.generationStep && <p className="mt-1 text-sm text-indigo-600">{section.generationStep}</p>}
                            </div>
                        )}
                        {section.status === 'error' && (
                            <div className="text-red-500 p-4">{section.errorMessage}</div>
                        )}
                        {section.status === 'pending' && section.baseImage && (
                           <img src={section.baseImage} alt="カノエくんの基準画像" className="w-full h-full object-contain p-4" />
                        )}
                        </div>
                        <button
                            onClick={handleGenerate}
                            disabled={section.status === 'generating'}
                            className="mt-4 px-4 py-2 bg-indigo-500 text-white text-sm font-semibold rounded-md hover:bg-indigo-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            {buttonText}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
