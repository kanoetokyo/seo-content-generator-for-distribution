import React, { useState, useCallback, useEffect } from 'react';
import { H2Section, ReportLog } from '../types';
import { H2ProcessingCard } from './H2ProcessingCard';

interface ProcessingViewProps {
    sections: H2Section[];
    onComplete: (finalSections: H2Section[], logs: ReportLog[]) => void;
    autoExecute?: boolean;  // 自動実行フラグ
}

export const ProcessingView: React.FC<ProcessingViewProps> = ({ sections: initialSections, onComplete, autoExecute }) => {
    const [sections, setSections] = useState<H2Section[]>(initialSections);
    const [isProcessingAll, setIsProcessingAll] = useState(false);
    const [completedCount, setCompletedCount] = useState(0);
    const [currentProcessingIndex, setCurrentProcessingIndex] = useState<number | null>(null);
    const [hasAutoExecuted, setHasAutoExecuted] = useState(false); // 自動実行済みフラグ

    const updateSection = useCallback((updatedSection: H2Section) => {
        setSections(prevSections =>
            prevSections.map(s => (s.id === updatedSection.id ? updatedSection : s))
        );
        
        // 順次処理中で、現在のセクションが完了した場合
        if (isProcessingAll && currentProcessingIndex !== null) {
            if (updatedSection.status === 'success' || updatedSection.status === 'error') {
                // 完了カウントを更新
                setCompletedCount(prev => prev + 1);
                
                // 3秒待機してから次のセクションへ
                setTimeout(() => {
                    setSections(currentSections => {
                        // 次のpendingセクションを探す
                        const nextPendingIndex = currentSections.findIndex(
                            (s, idx) => idx > currentProcessingIndex && s.status === 'pending'
                        );
                        
                        if (nextPendingIndex >= 0) {
                            console.log(`⏳ 次のセクションへ進みます: ${currentSections[nextPendingIndex].h2Text}`);
                            setCurrentProcessingIndex(nextPendingIndex);
                        } else {
                            console.log('✅ 全セクションの処理が完了しました');
                            setIsProcessingAll(false);
                            setCurrentProcessingIndex(null);
                        }
                        
                        return currentSections;
                    });
                }, 3000); // 3秒待機
            }
        }
    }, [isProcessingAll, currentProcessingIndex]);
    
    const allProcessed = sections.every(s => s.status === 'success' || s.status === 'error');
    
    // 一括生成完了時の処理
    useEffect(() => {
        if (allProcessed && isProcessingAll) {
            // 一括処理完了時にisProcessingAllをfalseにリセット
            setIsProcessingAll(false);
            setCompletedCount(0);

            // 成功した画像の数を確認
            const successCount = sections.filter(s => s.status === 'success').length;
            const errorCount = sections.filter(s => s.status === 'error').length;

            if (successCount === 0) {
                // 全部エラーの場合は停止
                console.log('❌ すべての画像生成でエラーが発生しました。処理を停止します。');
                alert('画像生成でエラーが発生しました。処理を停止します。');
                return;
            }

            console.log(`✅ 画像生成完了: 成功 ${successCount}件, エラー ${errorCount}件`);

            // autoExecuteの場合は自動でReportViewへ遷移
            if (autoExecute) {
                console.log('🚀 自動実行モード: ReportViewへ自動遷移します');
                const logs: ReportLog[] = sections.map(s => ({
                    h2Text: s.h2Text,
                    status: s.status as 'success' | 'error',
                    message: s.errorMessage || '画像を生成し、ブログ用サイズへ調整しました。',
                    imageUrl: s.sourceUrl || s.generatedImage || undefined,
                    mediaId: s.mediaId || undefined,
                }));
                onComplete(sections, logs);
            } else {
                console.log('✅ 一括生成が完了しました。画像を確認してください。');
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allProcessed, sections, isProcessingAll, autoExecute]);

    const handleGenerateAll = useCallback(() => {
        console.log('🚀 順次処理を開始します');
        setIsProcessingAll(true);
        setCompletedCount(0);
        // 最初のpendingセクションから開始
        const firstPendingIndex = sections.findIndex(s => s.status === 'pending');
        if (firstPendingIndex >= 0) {
            setCurrentProcessingIndex(firstPendingIndex);
        }
    }, [sections]);

    // 自動実行: autoExecuteがtrueの場合、2秒後に全画像生成を開始（1回のみ）
    useEffect(() => {
        if (autoExecute && sections.length > 0 && !hasAutoExecuted && !isProcessingAll) {
            console.log('🤖 自動実行モード検出 - 2秒後に全画像生成を開始します');
            const timer = setTimeout(() => {
                console.log('⏰ 2秒経過 - 全画像生成を自動実行します');
                setHasAutoExecuted(true); // タイマー実行時にフラグを立てる
                // handleGenerateAllの処理を直接実行
                console.log('🚀 順次処理を開始します');
                setIsProcessingAll(true);
                setCompletedCount(0);
                // 最初のpendingセクションから開始
                setSections(currentSections => {
                    const firstPendingIndex = currentSections.findIndex(s => s.status === 'pending');
                    if (firstPendingIndex >= 0) {
                        setCurrentProcessingIndex(firstPendingIndex);
                    }
                    return currentSections;
                });
            }, 2000);

            return () => clearTimeout(timer);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoExecute, sections.length, hasAutoExecuted, isProcessingAll]);
    
    const handleProceedToReport = () => {
        const logs: ReportLog[] = sections.map(s => {
            let status: 'success' | 'error' | 'skipped';
            let message: string;

            switch (s.status) {
                case 'success':
                    status = 'success';
                    message = '画像を生成し、ブログ用サイズへ調整しました。';
                    break;
                case 'error':
                    status = 'error';
                    message = s.errorMessage || '不明なエラーが発生しました。';
                    break;
                default: // 'pending' or 'generating'
                    status = 'skipped';
                    message = '画像生成を省略しました。';
                    break;
            }

            return {
                h2Text: s.h2Text,
                status,
                message,
                imageUrl: s.sourceUrl || s.generatedImage || undefined,
                mediaId: s.mediaId || undefined,
            };
        });
        onComplete(sections, logs);
    };

    const canProceed = sections.some(s => s.status === 'success');

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-md flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">各章のカノエくん画像</h2>
                    <p className="text-gray-600 mt-1">まとめ以外の全H2に、内容を説明する画像を1枚ずつ生成します。</p>
                </div>
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto">
                    <button
                        onClick={handleGenerateAll}
                        disabled={isProcessingAll}
                        className="w-full px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-gray-400"
                    >
                        {isProcessingAll ? `順次処理中... (${completedCount}/${sections.length})` : '全画像を順次生成'}
                    </button>
                    <button
                        onClick={handleProceedToReport}
                        disabled={!canProceed}
                        className="w-full px-6 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 disabled:bg-gray-400"
                    >
                        Notionへの保存へ進む
                    </button>
                </div>
            </div>
            <div className="space-y-4">
                {sections.map((section, index) => (
                    <H2ProcessingCard
                        key={section.id}
                        section={section}
                        updateSection={updateSection}
                        startProcessing={isProcessingAll && currentProcessingIndex === index}
                        onProcessingComplete={() => {}}
                    />
                ))}
            </div>
        </div>
    );
};
