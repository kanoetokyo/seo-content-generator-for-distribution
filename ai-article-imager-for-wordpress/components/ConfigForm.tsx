import React from "react";
import { NotionPostConfig } from "../types";

interface ConfigFormProps {
  postConfig: NotionPostConfig;
  setPostConfig: React.Dispatch<React.SetStateAction<NotionPostConfig>>;
  promptStyle: string;
  setPromptStyle: React.Dispatch<React.SetStateAction<string>>;
}

export const ConfigForm: React.FC<ConfigFormProps> = ({
  postConfig,
  setPostConfig,
  promptStyle,
  setPromptStyle,
}) => {
  const handlePostChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setPostConfig({ ...postConfig, [event.target.name]: event.target.value });
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold text-gray-900 mb-5">記事の保存設定</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="post-title" className="block text-sm font-medium text-gray-700">
            記事タイトル
          </label>
          <input
            type="text"
            name="title"
            id="post-title"
            value={postConfig.title}
            onChange={handlePostChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
          <p className="mt-2 text-xs text-gray-500">
            SEOエージェントから受け取ったタイトルが自動で入ります。
          </p>
        </div>
        <div>
          <label htmlFor="post-status" className="block text-sm font-medium text-gray-700">
            Notionの公開状態
          </label>
          <select
            id="post-status"
            name="status"
            value={postConfig.status}
            onChange={handlePostChange}
            className="mt-1 block w-full px-3 py-2 text-base border border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
          >
            <option value="published">公開記事として保存</option>
            <option value="draft">下書きとして保存</option>
          </select>
          <p className="mt-2 text-xs text-gray-500">
            通常は公開記事として保存します。確認が必要な場合だけ下書きを選んでください。
          </p>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="prompt-style" className="block text-sm font-medium text-gray-700">
            画像のテイスト
          </label>
          <input
            type="text"
            name="prompt-style"
            id="prompt-style"
            value={promptStyle}
            onChange={(event) => setPromptStyle(event.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="例: 清潔感のある実写風イラスト"
          />
        </div>
      </div>
    </div>
  );
};
