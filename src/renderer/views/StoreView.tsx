import './StoreView.css';
import { DAILY_SCRIPTURE_SHOP_URL } from '../lib/links';

export default function StoreView() {
    return (
        <div className="store-view">
            <h1 className="store-title">Daily Scripture Shop</h1>
            <p className="store-teaser">Spiritual books and journals to deepen your faith.</p>
            <button
                type="button"
                className="store-open-button"
                onClick={() => window.electronAPI.openExternal(DAILY_SCRIPTURE_SHOP_URL)}
                aria-describedby="store-hint"
            >
                Open Daily Scripture Shop
            </button>
            <p id="store-hint" className="store-hint">
                Opens in your browser.
            </p>
        </div>
    );
}
